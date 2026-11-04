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


# ─── Activities (reading finished runs back) ──────────────────────────────────
#
# Garmin's activity JSON is large and loosely shaped. Everything below picks out
# the few fields the app shows and returns them small and flat, so the server
# never stores Garmin's own objects. Every field is optional: a treadmill run
# has no track, an old watch no cadence.

MAX_TRACK_POINTS = 600
MAX_CHART_POINTS = 300
DATE_RE_LEN = 10


def _num(raw: Any) -> float | None:
    if isinstance(raw, bool) or not isinstance(raw, int | float):
        return None
    return float(raw)


def _date(raw: Any) -> str:
    if not isinstance(raw, str) or len(raw) < DATE_RE_LEN or raw[4] != "-" or raw[7] != "-":
        raise fail("bad_request")
    return raw[:DATE_RE_LEN]


def _workout_id(*sources: Any) -> str | None:
    """
    The Garmin workout an activity was run from, when it was started from one.
    Garmin has used more than one name for it across endpoints, so each likely
    key is tried in each likely place.
    """
    for src in sources:
        if not isinstance(src, dict):
            continue
        for key in ("workoutId", "associatedWorkoutId", "workoutID"):
            val = src.get(key)
            if isinstance(val, int | str) and not isinstance(val, bool) and str(val).isdigit() and int(val) > 0:
                return str(val)
    return None


def _type_key(a: dict[str, Any]) -> str:
    t = a.get("activityType") or a.get("activityTypeDTO") or {}
    return str(t.get("typeKey") or "other") if isinstance(t, dict) else "other"


def activity_brief(a: dict[str, Any]) -> dict[str, Any] | None:
    """One row of the activity list, reduced to what matching needs."""
    if not isinstance(a, dict) or not a.get("activityId"):
        return None
    return {
        "activityId": str(a["activityId"]),
        "name": str(a.get("activityName") or ""),
        "typeKey": _type_key(a),
        "startLocal": str(a.get("startTimeLocal") or ""),
        "startGMT": str(a.get("startTimeGMT") or ""),
        "distanceM": _num(a.get("distance")),
        "durationS": _num(a.get("duration")),
        "movingS": _num(a.get("movingDuration")),
        "avgHr": _num(a.get("averageHR")),
        "workoutId": _workout_id(a, a.get("metadataDTO"), a.get("summaryDTO")),
    }


def activity_summary(a: dict[str, Any]) -> dict[str, Any]:
    """The detail endpoint's summary block."""
    s = a.get("summaryDTO") or {}
    meta = a.get("metadataDTO") or {}
    cadence = s.get("averageRunCadence")
    if cadence is None:
        cadence = s.get("averageRunningCadenceInStepsPerMinute")
    return {
        "activityId": str(a.get("activityId") or ""),
        "name": str(a.get("activityName") or ""),
        "typeKey": _type_key(a),
        "startLocal": str(s.get("startTimeLocal") or ""),
        "startGMT": str(s.get("startTimeGMT") or ""),
        "distanceM": _num(s.get("distance")),
        "durationS": _num(s.get("duration")),
        "movingS": _num(s.get("movingDuration")),
        "elapsedS": _num(s.get("elapsedDuration")),
        "avgSpeed": _num(s.get("averageSpeed")),
        "maxSpeed": _num(s.get("maxSpeed")),
        "avgHr": _num(s.get("averageHR")),
        "maxHr": _num(s.get("maxHR")),
        "elevGainM": _num(s.get("elevationGain")),
        "elevLossM": _num(s.get("elevationLoss")),
        "cadence": _num(cadence),
        "calories": _num(s.get("calories")),
        "aerobicTE": _num(s.get("trainingEffect")),
        "anaerobicTE": _num(s.get("anaerobicTrainingEffect")),
        "teLabel": str(s.get("trainingEffectLabel") or "") or None,
        "workoutId": _workout_id(a, meta, s),
        "deviceName": str((meta.get("deviceMetaDataDTO") or {}).get("deviceName") or "") or None,
    }


def activity_laps(splits: Any) -> list[dict[str, Any]]:
    laps = (splits or {}).get("lapDTOs") if isinstance(splits, dict) else None
    out = []
    for i, lap in enumerate(laps or []):
        if not isinstance(lap, dict):
            continue
        step = lap.get("wktStepIndex")
        out.append(
            {
                "index": i,
                "distanceM": _num(lap.get("distance")),
                "durationS": _num(lap.get("duration")),
                "movingS": _num(lap.get("movingDuration")),
                "avgSpeed": _num(lap.get("averageSpeed")),
                "avgHr": _num(lap.get("averageHR")),
                "maxHr": _num(lap.get("maxHR")),
                "elevGainM": _num(lap.get("elevationGain")),
                "intensity": str(lap.get("intensityType") or "") or None,
                "stepIndex": int(step) if isinstance(step, int) and not isinstance(step, bool) else None,
            }
        )
    return out


def activity_zones(raw: Any) -> list[dict[str, Any]]:
    out = []
    for z in raw if isinstance(raw, list) else []:
        if not isinstance(z, dict) or not isinstance(z.get("zoneNumber"), int):
            continue
        out.append(
            {
                "zone": z["zoneNumber"],
                "seconds": _num(z.get("secsInZone")) or 0.0,
                "lowBpm": _num(z.get("zoneLowBoundary")),
            }
        )
    return sorted(out, key=lambda z: z["zone"])


def _thin(items: list[Any], most: int) -> list[Any]:
    if len(items) <= most:
        return items
    step = len(items) / most
    picked = [items[int(i * step)] for i in range(most)]
    picked[-1] = items[-1]
    return picked


def activity_track(details: Any) -> list[list[float]]:
    """The GPS line as [lng, lat] pairs — the order the app's maps take."""
    poly = ((details or {}).get("geoPolylineDTO") or {}).get("polyline") if isinstance(details, dict) else None
    pts = []
    for p in poly or []:
        if not isinstance(p, dict):
            continue
        lat, lng = _num(p.get("lat")), _num(p.get("lon"))
        if lat is None or lng is None or (lat == 0 and lng == 0):
            continue
        pts.append([round(lng, 6), round(lat, 6)])
    return _thin(pts, MAX_TRACK_POINTS)


CHART_KEYS = {
    "t": ("sumElapsedDuration", "sumDuration"),
    "d": ("sumDistance",),
    "hr": ("directHeartRate",),
    "speed": ("directSpeed",),
    "elev": ("directElevation",),
}


def activity_chart(details: Any) -> dict[str, list[float | None]]:
    """Time, distance, HR, speed and elevation, sampled together."""
    if not isinstance(details, dict):
        return {}
    index: dict[str, int] = {}
    for d in details.get("metricDescriptors") or []:
        if isinstance(d, dict) and isinstance(d.get("key"), str) and isinstance(d.get("metricsIndex"), int):
            index[d["key"]] = d["metricsIndex"]
    cols = {name: next((index[k] for k in keys if k in index), None) for name, keys in CHART_KEYS.items()}
    if cols["t"] is None:
        return {}
    rows = [r.get("metrics") for r in details.get("activityDetailMetrics") or [] if isinstance(r, dict)]
    rows = _thin([r for r in rows if isinstance(r, list)], MAX_CHART_POINTS)
    out: dict[str, list[float | None]] = {}
    for name, col in cols.items():
        if col is None:
            continue
        series = [_num(r[col]) if col < len(r) else None for r in rows]
        if any(v is not None for v in series):
            out[name] = [round(v, 2) if v is not None else None for v in series]
    return out if "t" in out else {}


def op_list_activities(req: dict[str, Any]) -> dict[str, Any]:
    api = _client(req)
    start, end = _date(req.get("from")), _date(req.get("to"))
    rows = api.get_activities_by_date(start, end) or []
    briefs = [b for b in (activity_brief(a) for a in rows) if b]
    return {"result": {"activities": briefs}, "tokens": _dump(api)}


def op_get_activity(req: dict[str, Any]) -> dict[str, Any]:
    """
    One activity in full. The summary must come back; the rest are extras, so a
    run with no GPS or no HR still links, just with less to show.
    """
    api = _client(req)
    activity_id = str(_id(req.get("activityId"), "activityId"))
    summary = activity_summary(api.get_activity(activity_id) or {})

    def extra(fn: Any, *args: Any) -> Any:
        try:
            return fn(*args)
        except GarminConnectAuthenticationError:
            raise
        except Exception:
            return None

    laps = activity_laps(extra(api.get_activity_splits, activity_id))
    zones = activity_zones(extra(api.get_activity_hr_in_timezones, activity_id))
    details = extra(api.get_activity_details, activity_id, MAX_CHART_POINTS * 4, MAX_TRACK_POINTS * 2)
    return {
        "result": {
            "summary": summary,
            "laps": laps,
            "zones": zones,
            "track": activity_track(details),
            "chart": activity_chart(details),
        },
        "tokens": _dump(api),
    }


OPS = {
    "list_activities": op_list_activities,
    "get_activity": op_get_activity,
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
