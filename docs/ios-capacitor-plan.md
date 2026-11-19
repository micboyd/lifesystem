# AdminLife iOS app — Capacitor plan

Wrap the existing Vite + React client in a native iOS shell with Capacitor. Same repo, same codebase. Work on branch `ios-capacitor`.

## Decisions
- Bundled web build inside the app (not a remote `server.url`). Live updates (Capgo) can come later.
- Bundle ID: `co.adminlife.app`. App name: AdminLife.
- Distribution: TestFlight only (personal use), no App Store review.
- Capacitor lives in `client/` (`client/ios/`, `client/capacitor.config.ts`). Netlify and Heroku builds are unaffected.
- Before starting: commit the in-progress AdminLife 2.0 redesign so iOS changes land on a clean branch.

## Phase 1 — Shell running on device
1. In `client/`: install `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`; `npx cap init AdminLife co.adminlife.app --web-dir dist`; `npx cap add ios`. Commit `ios/`.
2. API base URL: `client/src/services/api.ts` falls back to relative `/api` when `VITE_API_URL` is unset, which breaks under `capacitor://localhost`. Add `client/.env.production` with the Heroku API URL (same value Netlify uses).
3. CORS: add `'capacitor://localhost'` to `allowedOrigins` in `server/src/index.ts`.
4. Font Awesome: `client/index.html` loads kit `a07e376782` from kit.fontawesome.com, which is domain-restricted. Either allow `capacitor://localhost` in kit settings or move to the npm packages — otherwise icons vanish.
5. Safe areas: add `viewport-fit=cover` to the viewport meta in `index.html`; apply `env(safe-area-inset-*)` to `AppNav` (top bar + phone tab bar), `BottomSheet`, `Drawer`.
6. 401 handling in `api.ts` uses `window.location.assign('/login')` (full reload) — switch to router navigation.
7. Root script: `"ios": "npm run build --prefix client && cd client && npx cap sync ios && npx cap open ios"`.

## Phase 2 — Replace web-only APIs
| Issue | Where | Fix |
|---|---|---|
| Blob downloads (`createObjectURL` + `a.download`) don't work in WKWebView | `CalendarExportDrawer`, `RouteDrawer` (GPX), `FitnessExportCenter`, `PlannerExportDrawer`, `PhaseExportDrawer`, `PlanLibrary`, `BodyPhotos` | `lib/saveFile.ts`: web = current behaviour; native = `@capacitor/filesystem` write to cache + `@capacitor/share` |
| Token can be purged with WebView storage | `AuthContext.tsx`, `api.ts` | Store token via `@capacitor/preferences` (other localStorage use is drafts/UI state — leave) |
| Location prompt says "localhost", double-prompts | `lib/routeLocation.ts`, `RouteMap`, `LiveRouteMap`, `LocationPicker` | `@capacitor/geolocation`; `NSLocationWhenInUseUsageDescription` in Info.plist |
| Google Maps hand-off | `window.open` in `RouteDrawer`, `WalkPlanner` | `@capacitor/app-launcher` |
| External `target="_blank"` links | `ExerciseVideo`, `DayAgenda`, `TimeboxDrawer`, `GarminRunPanel`, `BodyPhotos` | Verify they open in Safari; else `@capacitor/browser` |
| Photo upload | `BodyPhotos` file input | Works; add `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` |
| Clipboard | 9 files | Likely fine; fallback `@capacitor/clipboard` |
| Map tiles | Leaflet OSM tiles in `RouteMap`, `LiveRouteMap` | Test; if OSM blocks, switch to MapTiler/Stadia free tier |

Use `Capacitor.isNativePlatform()` to branch; keep web behaviour unchanged.

## Phase 3 — Native polish
- Icon + splash: `@capacitor/assets` from one 1024px PNG.
- `@capacitor/status-bar`: match canvas colour, light/dark.
- `@capacitor/keyboard`: keep inputs in drawers/sheets visible.
- CSS: no tap highlight, no text selection on controls, no rubber-band on the app shell.

## Phase 4 — Ship
- Apple Developer Program (£79/year).
- App Store Connect record → Xcode Archive → TestFlight. Builds expire after 90 days.

## Later
- `@capacitor/local-notifications` for conditioning session alerts and reminders (no server work).
- Push notifications (APNs + scheduler on Heroku).
- HealthKit steps.
- Today widget (Swift/WidgetKit).
