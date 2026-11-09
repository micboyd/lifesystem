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

    activities: list = []
    splits_error: Exception | None = None

    summaries: dict = {}

    def get_user_summary(self, cdate):
        value = FakeGarmin.summaries.get(cdate)
        if isinstance(value, Exception):
            raise value
        return value

    steps: list | Exception = []

    def get_daily_steps(self, start, end):
        FakeGarmin.asked_range = (start, end)
        if isinstance(FakeGarmin.steps, Exception):
            raise FakeGarmin.steps
        return FakeGarmin.steps

    def get_activities_by_date(self, start, end=None):
        FakeGarmin.asked_range = (start, end)
        return FakeGarmin.activities

    def get_activity(self, activity_id):
        return {
            "activityId": int(activity_id),
            "activityName": "Morning Run",
            "activityTypeDTO": {"typeKey": "running"},
            "metadataDTO": {"associatedWorkoutId": 42, "deviceMetaDataDTO": {"deviceName": "fenix 7X"}},
            "summaryDTO": {
                "startTimeLocal": "2026-11-04T07:01:00.0",
                "distance": 5012.4,
                "duration": 1800.2,
                "movingDuration": 1790.0,
                "averageSpeed": 2.78,
                "averageHR": 151.0,
                "elevationGain": 34.0,
                "averageRunCadence": 168.0,
                "trainingEffect": 3.1,
            },
        }

    def get_activity_splits(self, activity_id):
        if FakeGarmin.splits_error:
            raise FakeGarmin.splits_error
        return {"lapDTOs": [{"distance": 1000.0, "duration": 360.0, "averageSpeed": 2.77, "wktStepIndex": 0, "intensityType": "WARMUP"}]}

    def get_activity_hr_in_timezones(self, activity_id):
        return [{"zoneNumber": 2, "secsInZone": 600.0, "zoneLowBoundary": 120}, {"zoneNumber": 1, "secsInZone": 60.0}]

    def get_activity_details(self, activity_id, maxchart, maxpoly):
        return {
            "geoPolylineDTO": {"polyline": [{"lat": 51.5, "lon": -0.1}, {"lat": 0, "lon": 0}, {"lat": 51.51, "lon": -0.11}]},
            "metricDescriptors": [{"key": "sumElapsedDuration", "metricsIndex": 0}, {"key": "directHeartRate", "metricsIndex": 1}],
            "activityDetailMetrics": [{"metrics": [0.0, 100.0]}, {"metrics": [5.0, None]}, {"metrics": [10.0, 140.0]}],
        }


class WorkerTest(unittest.TestCase):
    def setUp(self):
        FakeGarmin.login_error = None
        FakeGarmin.upload_error = None
        FakeGarmin.needs_mfa = False
        FakeGarmin.devices = []
        FakeGarmin.primary = None
        FakeGarmin.pushed_to = []
        FakeGarmin.activities = []
        FakeGarmin.splits_error = None
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

    def test_list_activities_is_reduced_to_briefs(self):
        FakeGarmin.activities = [
            {"activityId": 7, "activityName": "Run", "activityType": {"typeKey": "running"}, "startTimeLocal": "2026-11-04 07:01:00",
             "distance": 5000.0, "duration": 1800.0, "workoutId": 42, "ownerFullName": SECRET},
            {"no": "id"},
        ]
        reply = self.run_op({"op": "list_activities", "tokens": TOKENS, "from": "2026-11-03", "to": "2026-11-04"})
        acts = reply["result"]["activities"]
        self.assertEqual(len(acts), 1)
        self.assertEqual(acts[0]["activityId"], "7")
        self.assertEqual(acts[0]["typeKey"], "running")
        self.assertEqual(acts[0]["workoutId"], "42")
        self.assertEqual(FakeGarmin.asked_range, ("2026-11-03", "2026-11-04"))

    def test_daily_calories_reads_each_days_total(self):
        FakeGarmin.summaries = {
            "2026-11-02": {"totalKilocalories": 3448.4, "activeKilocalories": 1200},
            "2026-11-03": {"totalKilocalories": None},
            "2026-11-04": RuntimeError("one bad day"),
        }
        reply = self.run_op({"op": "daily_calories", "tokens": TOKENS, "dates": ["2026-11-02", "2026-11-03", "2026-11-04"]})
        self.assertTrue(reply["ok"])
        self.assertEqual(reply["result"]["days"], [{"date": "2026-11-02", "kcal": 3448}])

    def test_daily_calories_needs_dates(self):
        self.assertEqual(self.run_op({"op": "daily_calories", "tokens": TOKENS, "dates": []})["code"], "bad_request")
        self.assertEqual(self.run_op({"op": "daily_calories", "tokens": TOKENS, "dates": ["soon"]})["code"], "bad_request")

    def test_daily_calories_expired_session(self):
        FakeGarmin.summaries = {"2026-11-02": garminconnect.GarminConnectAuthenticationError("nope")}
        reply = self.run_op({"op": "daily_calories", "tokens": TOKENS, "dates": ["2026-11-02"]})
        self.assertEqual(reply["code"], "session_expired")

    def test_daily_steps_keeps_days_with_a_figure(self):
        FakeGarmin.steps = [
            {"calendarDate": "2026-11-07", "totalSteps": 9120, "stepGoal": 8000},
            {"calendarDate": "2026-11-08", "totalSteps": 0},
            {"calendarDate": "2026-11-09", "totalSteps": None},
            "junk",
        ]
        reply = self.run_op({"op": "daily_steps", "tokens": TOKENS, "from": "2026-11-07", "to": "2026-11-09"})
        self.assertTrue(reply["ok"])
        self.assertEqual(reply["result"]["days"], [{"date": "2026-11-07", "steps": 9120}])
        self.assertEqual(FakeGarmin.asked_range, ("2026-11-07", "2026-11-09"))

    def test_daily_steps_needs_dates(self):
        reply = self.run_op({"op": "daily_steps", "tokens": TOKENS, "from": "soon", "to": "2026-11-09"})
        self.assertEqual(reply["code"], "bad_request")

    def test_daily_steps_expired_session(self):
        FakeGarmin.steps = garminconnect.GarminConnectAuthenticationError("nope")
        reply = self.run_op({"op": "daily_steps", "tokens": TOKENS, "from": "2026-11-07", "to": "2026-11-09"})
        self.assertEqual(reply["code"], "session_expired")

    def test_list_activities_needs_dates(self):
        reply = self.run_op({"op": "list_activities", "tokens": TOKENS, "from": "yesterday", "to": "2026-11-04"})
        self.assertEqual(reply["code"], "bad_request")

    def test_get_activity_collects_summary_laps_zones_track_and_chart(self):
        r = self.run_op({"op": "get_activity", "tokens": TOKENS, "activityId": "7"})["result"]
        self.assertEqual(r["summary"]["workoutId"], "42")
        self.assertEqual(r["summary"]["distanceM"], 5012.4)
        self.assertEqual(r["summary"]["cadence"], 168.0)
        self.assertEqual(r["summary"]["deviceName"], "fenix 7X")
        self.assertEqual(r["laps"][0]["stepIndex"], 0)
        self.assertEqual([z["zone"] for z in r["zones"]], [1, 2])
        self.assertEqual(r["track"], [[-0.1, 51.5], [-0.11, 51.51]])
        self.assertEqual(r["chart"]["t"], [0.0, 5.0, 10.0])
        self.assertEqual(r["chart"]["hr"], [100.0, None, 140.0])

    def test_get_activity_survives_a_missing_extra(self):
        FakeGarmin.splits_error = garminconnect.GarminConnectConnectionError("boom")
        r = self.run_op({"op": "get_activity", "tokens": TOKENS, "activityId": "7"})
        self.assertTrue(r["ok"])
        self.assertEqual(r["result"]["laps"], [])

    def test_unknown_op(self):
        self.assertEqual(self.run_op({"op": "rm -rf"})["code"], "bad_request")


if __name__ == "__main__":
    unittest.main()
