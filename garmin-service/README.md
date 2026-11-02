# Garmin worker

Sends conditioning sessions to Garmin Connect as structured running workouts,
via the unofficial [python-garminconnect](https://github.com/cyberjunky/python-garminconnect)
(pinned in `requirements.txt`).

The Node server runs `worker.py` once per operation (create, update, schedule,
unschedule, push, login, MFA) with one JSON request on stdin. The worker keeps
no state and writes no files; the server stores Garmin's tokens encrypted with
`GARMIN_TOKEN_KEY`. Everything app-side lives in `server/src/garmin/` behind
`GarminWorkoutProvider`, so this worker can be swapped for Garmin's official
Training API without touching the UI.

## Setup (Python 3.12+)

```bash
python3.12 -m venv garmin-service/.venv
garmin-service/.venv/bin/pip install -r garmin-service/requirements.txt
```

The server uses `garmin-service/.venv/bin/python` when it exists, else
`GARMIN_PYTHON`, else `python3`.

## Environment

- `GARMIN_TOKEN_KEY` (required): 32 random bytes, hex or base64. Generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
  Changing it means reconnecting Garmin.
- `GARMIN_PYTHON` (optional): the Python 3.12+ interpreter to run the worker with.

## Tests

```bash
cd garmin-service && .venv/bin/python -m unittest -v test_worker
```

Garmin is faked in these and in the server's tests (`npm test --prefix server`).
To send one real test workout to your account (after connecting in Profile → Garmin):

```bash
npm run garmin:send-test --prefix server
```
