"""
Worker tests, with garminconnect replaced by a fake so nothing reaches Garmin.

Run: .venv/bin/python -m unittest -v test_worker
"""

import json
import unittest
from unittest import mock

import garminconnect

import worker

SECRET = "hunter2-very-secret"
TOKENS = json.dumps({"di_token": "tok-" + SECRET})


class FakeGarmin:
    """Stands in for garminconnect.Garmin; behaviour set per test."""

    login_error: Exception | None = None
    upload_error: Exception | None = None
    needs_mfa = False

    def __init__(self, email=None, password=None, return_on_mfa=False):
        self.client = mock.Mock()
        self.client.dumps.return_value = TOKENS

    def login(self, tokenstore=None):
        if FakeGarmin.login_error:
            raise FakeGarmin.login_error
        return ("needs_mfa", {"cookie": "c"}) if FakeGarmin.needs_mfa else (None, None)

    def resume_login(self, state, code):
        if code != "123456":
            raise garminconnect.GarminConnectAuthenticationError(f"bad code {code} for {SECRET}")

    def get_full_name(self):
        return "Test Runner"

    def upload_workout(self, workout):
        if FakeGarmin.upload_error:
            raise FakeGarmin.upload_error
        return {"workoutId": 42}

    def schedule_workout(self, workout_id, date):
        return {"workoutScheduleId": 99, "calendarDate": date}

    devices: list = []
    primary: int | None = None
    pushed_to: list = []

    def get_devices(self):
        return FakeGarmin.devices

    def get_primary_training_device(self):
        return {"PrimaryTrainingDevice": {"deviceId": FakeGarmin.primary}} if FakeGarmin.primary else {}

    def push_workout_to_device(self, workout_id, device_id):
        FakeGarmin.pushed_to.append(device_id)


class WorkerTest(unittest.TestCase):
    def setUp(self):
        FakeGarmin.login_error = None
        FakeGarmin.upload_error = None
        FakeGarmin.needs_mfa = False
        FakeGarmin.devices = []
        FakeGarmin.primary = None
        FakeGarmin.pushed_to = []
        patcher = mock.patch.object(worker.garminconnect, "Garmin", FakeGarmin)
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_op(self, req):
        reply = worker.handle(req)
        self.assertNotIn(SECRET, json.dumps({k: v for k, v in reply.items() if k != "tokens"}))
        return reply

    def test_login_returns_tokens_only_in_tokens_field(self):
        reply = self.run_op({"op": "login", "email": "me@example.com", "password": SECRET})
        self.assertEqual(reply["ok"], True)
        self.assertEqual(reply["result"]["status"], "connected")
        self.assertEqual(reply["tokens"], TOKENS)

    def test_bad_password_never_echoes_it(self):
        FakeGarmin.login_error = garminconnect.GarminConnectAuthenticationError(f"401 for password {SECRET}")
        reply = self.run_op({"op": "login", "email": "me@example.com", "password": SECRET})
        self.assertEqual(reply["code"], "auth_failed")

    def test_mfa_round_trip(self):
        FakeGarmin.needs_mfa = True
        reply = self.run_op({"op": "login", "email": "me@example.com", "password": SECRET})
        self.assertEqual(reply["result"]["status"], "needs_mfa")
        state = reply["result"]["mfaState"]
        wrong = self.run_op({"op": "resume_mfa", "mfaState": state, "code": "000000"})
        self.assertEqual(wrong["code"], "auth_failed")
        right = self.run_op({"op": "resume_mfa", "mfaState": state, "code": "123456"})
        self.assertEqual(right["result"]["status"], "connected")

    def test_expired_tokens_map_to_session_expired(self):
        FakeGarmin.login_error = garminconnect.GarminConnectAuthenticationError(f"expired {SECRET}")
        reply = self.run_op({"op": "create", "tokens": TOKENS, "workout": {}})
        self.assertEqual(reply["code"], "session_expired")

    def test_missing_tokens_is_session_expired(self):
        self.assertEqual(self.run_op({"op": "create", "workout": {}})["code"], "session_expired")

    def test_library_error_text_is_not_passed_on(self):
        FakeGarmin.upload_error = garminconnect.GarminConnectConnectionError(f"500 body with {SECRET}")
        reply = self.run_op({"op": "create", "tokens": TOKENS, "workout": {}})
        self.assertEqual(reply["code"], "unavailable")
        FakeGarmin.upload_error = RuntimeError(SECRET)
        self.assertEqual(self.run_op({"op": "create", "tokens": TOKENS, "workout": {}})["code"], "error")

    def test_create_and_schedule(self):
        self.assertEqual(self.run_op({"op": "create", "tokens": TOKENS, "workout": {}})["result"], {"workoutId": "42"})
        reply = self.run_op({"op": "schedule", "tokens": TOKENS, "workoutId": "42", "date": "2026-11-03"})
        self.assertEqual(reply["result"], {"scheduleId": "99"})

    def test_push_without_a_device(self):
        self.assertEqual(self.run_op({"op": "push", "tokens": TOKENS, "workoutId": "42"})["code"], "no_device")

    SCALE = {"deviceId": 1, "displayName": "Index S2", "workoutCapable": False, "runningWorkoutCapable": False, "deviceStatus": "active"}
    WATCH = {"deviceId": 2, "displayName": "fenix 7X Solar", "workoutCapable": True, "runningWorkoutCapable": True, "deviceStatus": "active"}

    def test_push_goes_to_the_primary_watch_not_the_scale(self):
        FakeGarmin.devices = [self.SCALE, self.WATCH]
        FakeGarmin.primary = 2
        reply = self.run_op({"op": "push", "tokens": TOKENS, "workoutId": "42"})
        self.assertEqual(reply["result"], {"deviceName": "fenix 7X Solar"})
        self.assertEqual(FakeGarmin.pushed_to, [2])

    def test_push_without_a_primary_uses_a_workout_capable_device(self):
        FakeGarmin.devices = [self.SCALE, self.WATCH]
        self.run_op({"op": "push", "tokens": TOKENS, "workoutId": "42"})
        self.assertEqual(FakeGarmin.pushed_to, [2])

    def test_push_never_goes_to_a_scale(self):
        FakeGarmin.devices = [self.SCALE]
        FakeGarmin.primary = 1
        self.assertEqual(self.run_op({"op": "push", "tokens": TOKENS, "workoutId": "42"})["code"], "no_device")
        self.assertEqual(FakeGarmin.pushed_to, [])

    def test_unknown_op(self):
        self.assertEqual(self.run_op({"op": "rm -rf"})["code"], "bad_request")


if __name__ == "__main__":
    unittest.main()
