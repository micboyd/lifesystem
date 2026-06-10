---
name: verification-workflow
description: User tests the running app themselves; don't drive the browser preview to verify
metadata:
    type: feedback
---

The user verifies running behavior themselves and will report back. Do not launch/drive the browser preview (preview\_\* tools) to manually test features after a change.

**Why:** The user prefers to do interactive testing; agent-driven browser automation in this project was flaky (bfcache, HMR reloads mid-interaction) and wasted effort.

**How to apply:** When the code change is complete, stop and hand off — say it's ready to test. Still run non-interactive checks that don't need the browser (e.g. `tsc --noEmit` typecheck, lint). Backend API behavior can still be sanity-checked with curl when useful, but leave UI verification to the user.
