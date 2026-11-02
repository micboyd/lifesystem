"""
A one-shot Garmin Connect worker for AdminLife, built on python-garminconnect.

The Node server runs this once per operation, writes one JSON request to stdin
and reads one JSON reply from stdout. It keeps no state and writes no files:
tokens arrive in the request and any refreshed tokens go back in the reply, so
the server alone stores them (encrypted). Nothing is logged, and replies never
carry a credential or the library's own error text, which can echo a request.

Request:  {"op": "...", "tokens": "<token json>"?, ...op fields}
Reply:    {"ok": true, "result": {...}, "tokens": "<token json>"?}
          {"ok": false, "code": "<code>", "message": "<safe text>"}

Codes: bad_request, auth_failed, needs_mfa, session_expired, unavailable,
rate_limited, not_found, no_device, error.
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Any

if sys.version_info < (3, 12):  # pragma: no cover - checked before any import of the library
    print(json.dumps({"ok": False, "code": "error", "message": "Python 3.12 or newer is required."}))
    sys.exit(0)

# The library logs at DEBUG; make sure nothing it says reaches stderr or a log drain.
logging.disable(logging.CRITICAL)

import garminconnect  # noqa: E402
from garminconnect import (  # noqa: E402
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectNotFoundError,
    GarminConnectTooManyRequestsError,
)


class WorkerError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


SAFE_MESSAGES = {
    "auth_failed": "Garmin didn't accept that email and password.",
    "session_expired": "Your Garmin session has expired. Reconnect Garmin to carry on.",
    "unavailable": "Garmin Connect isn't responding right now.",
    "rate_limited": "Garmin is limiting requests. Try again in a few minutes.",
    "not_found": "Garmin couldn't find that item.",
    "no_device": "No Garmin device was found on your account.",
    "bad_request": "The request to the Garmin worker was malformed.",
    "error": "Something went wrong talking to Garmin.",
}


def fail(code: str) -> WorkerError:
    return WorkerError(code, SAFE_MESSAGES[code])


def _client(req: dict[str, Any]) -> garminconnect.Garmin:
    """A client logged in from the request's saved tokens."""
    tokens = req.get("tokens")
    if not isinstance(tokens, str) or not tokens:
        raise fail("session_expired")
    api = garminconnect.Garmin()
    try:
        api.login(tokens)
    except GarminConnectAuthenticationError:
        raise fail("session_expired") from None
    return api


def _dump(api: garminconnect.Garmin) -> str:
    return api.client.dumps()


def _id(raw: Any, name: str) -> int:
    if isinstance(raw, bool) or not isinstance(raw, int | str) or not str(raw).isdigit():
        raise fail("bad_request")
    return int(raw)


# ─── Operations ────────────────────────────────────────────────────────────────


def op_login(req: dict[str, Any]) -> dict[str, Any]:
    email, password = req.get("email"), req.get("password")
    if not isinstance(email, str) or not isinstance(password, str) or not email or not password:
        raise fail("bad_request")
    api = garminconnect.Garmin(email, password, return_on_mfa=True)
    try:
        status, state = api.login()
    except GarminConnectAuthenticationError:
        raise fail("auth_failed") from None
    if status == "needs_mfa":
        # JSON-serialisable per the library; the server encrypts it until the code comes.
        return {"result": {"status": "needs_mfa", "mfaState": json.dumps(state)}}
    return {"result": {"status": "connected", "displayName": api.get_full_name()}, "tokens": _dump(api)}


def op_resume_mfa(req: dict[str, Any]) -> dict[str, Any]:
    state, code = req.get("mfaState"), req.get("code")
    if not isinstance(state, str) or not isinstance(code, str) or not code.strip():
        raise fail("bad_request")
    api = garminconnect.Garmin(return_on_mfa=True)
    try:
        api.resume_login(json.loads(state), code.strip())
    except GarminConnectAuthenticationError:
        raise fail("auth_failed") from None
    return {"result": {"status": "connected", "displayName": api.get_full_name()}, "tokens": _dump(api)}


def op_create(req: dict[str, Any]) -> dict[str, Any]:
    api = _client(req)
    workout = req.get("workout")
    if not isinstance(workout, dict):
        raise fail("bad_request")
    out = api.upload_workout(workout)
    return {"result": {"workoutId": str(out["workoutId"])}, "tokens": _dump(api)}


def op_update(req: dict[str, Any]) -> dict[str, Any]:
    api = _client(req)
    workout = req.get("workout")
    if not isinstance(workout, dict):
        raise fail("bad_request")
    api.update_workout(_id(req.get("workoutId"), "workoutId"), workout)
    return {"result": {}, "tokens": _dump(api)}


def op_schedule(req: dict[str, Any]) -> dict[str, Any]:
    api = _client(req)
    date = req.get("date")
    if not isinstance(date, str):
        raise fail("bad_request")
    out = api.schedule_workout(_id(req.get("workoutId"), "workoutId"), date)
    schedule_id = (out or {}).get("workoutScheduleId") or (out or {}).get("scheduleId") or (out or {}).get("id")
    if schedule_id is None:
        raise fail("error")
    return {"result": {"scheduleId": str(schedule_id)}, "tokens": _dump(api)}


def op_unschedule(req: dict[str, Any]) -> dict[str, Any]:
    api = _client(req)
    try:
        api.unschedule_workout(_id(req.get("scheduleId"), "scheduleId"))
    except GarminConnectNotFoundError:
        pass  # Already gone from the calendar — the goal is met.
    return {"result": {}, "tokens": _dump(api)}


def _watch(api: garminconnect.Garmin) -> tuple[int, str | None]:
    """
    The device a workout should go to: Garmin's primary training device, else
    the first active device that can run running workouts. Never "last used",
    which is often a scale or other device that can't take a workout.
    """
    devices = api.get_devices() or []
    capable = {
        d.get("deviceId"): d
        for d in devices
        if d.get("workoutCapable") and d.get("runningWorkoutCapable") and d.get("deviceStatus", "active") == "active"
    }
    try:
        primary = ((api.get_primary_training_device() or {}).get("PrimaryTrainingDevice") or {}).get("deviceId")
    except GarminConnectNotFoundError:
        primary = None
    chosen = capable.get(primary) or next(iter(capable.values()), None)
    if not chosen:
        raise fail("no_device")
    return int(chosen["deviceId"]), chosen.get("displayName") or chosen.get("productDisplayName")


def op_push(req: dict[str, Any]) -> dict[str, Any]:
    api = _client(req)
    device_id, name = _watch(api)
    api.push_workout_to_device(_id(req.get("workoutId"), "workoutId"), device_id)
    return {"result": {"deviceName": name}, "tokens": _dump(api)}


OPS = {
    "login": op_login,
    "resume_mfa": op_resume_mfa,
    "create": op_create,
    "update": op_update,
    "schedule": op_schedule,
    "unschedule": op_unschedule,
    "push": op_push,
}


def handle(req: Any) -> dict[str, Any]:
    """One request → one reply. Never raises; never echoes library errors."""
    try:
        if not isinstance(req, dict) or req.get("op") not in OPS:
            raise fail("bad_request")
        return {"ok": True, **OPS[req["op"]](req)}
    except WorkerError as e:
        return {"ok": False, "code": e.code, "message": e.message}
    except GarminConnectAuthenticationError:
        return {"ok": False, "code": "session_expired", "message": SAFE_MESSAGES["session_expired"]}
    except GarminConnectTooManyRequestsError:
        return {"ok": False, "code": "rate_limited", "message": SAFE_MESSAGES["rate_limited"]}
    except GarminConnectNotFoundError:
        return {"ok": False, "code": "not_found", "message": SAFE_MESSAGES["not_found"]}
    except GarminConnectConnectionError as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        code = "session_expired" if status in (401, 403) else "unavailable"
        return {"ok": False, "code": code, "message": SAFE_MESSAGES[code]}
    except Exception:
        return {"ok": False, "code": "error", "message": SAFE_MESSAGES["error"]}


def main() -> None:
    try:
        req = json.loads(sys.stdin.read())
    except Exception:
        req = None
    sys.stdout.write(json.dumps(handle(req)))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
