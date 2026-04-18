# Internal Handoff Note
**Date**: April 18, 2026
**Project**: shfi-hk / myapp (Expo React Native)
**Goal**: Build login/register screen and connect it to backend auth REST API.

## 1. What Was Accomplished
- **Runtime compatibility fix for current environment**:
  - Expo/Metro on Node `v18.19.1` failed with `TypeError: configs.toReversed is not a function`.
  - Added `scripts/node-compat.cjs` with polyfills for modern Array methods used by tooling.
  - Updated `package.json` scripts to run Expo CLI through `node -r ./scripts/node-compat.cjs ...`.
- **Bundling fix**:
  - Corrected logo asset import in `App.tsx` from non-existent `assets/icom.png` to existing `assets/icon.png`.
- **Auth API wired**:
  - `src/api.ts` now exports typed helpers for:
    - `register(payload)` → `POST /auth/register`
    - `login(payload)` → `POST /auth/login`
    - `protectedGet(path)` for authenticated/protected GET calls
  - Added request/response TypeScript interfaces (`AuthRequest`, `User`, `LoginResponse`, `RegisterResponse`).
  - Added `setAuthToken(token)` and Axios request interceptor to automatically attach:
    - `Authorization: Bearer <token>`
    - to API requests after login/session restore.
- **Login/Register screen implemented** in `App.tsx`:
  - Dark UI matching the provided `login_ui_template.html` direction.
  - Centered SHFI branding using `assets/icon.png`.
  - Email + password form inputs.
  - Primary action button executes current mode (`Sign In` or `Register`).
  - Secondary action toggles between login and register modes.
  - Loading state disables buttons and shows spinner.
  - API validation/server failures are shown as inline error messages.
  - Registration success is shown as inline status text and switches mode back to Sign In.
  - Successful login redirects to an in-app homepage view (authenticated state) with logout.
  - JWT + user are persisted in local storage via `@react-native-async-storage/async-storage`.
  - On app startup, persisted session is restored and user is redirected directly to homepage (skips login).
  - Logout clears persisted session and auth token header state.

## 2. Environment Gotchas (IMPORTANT)
Current working environment is Linux. Standard `npm`/`npx` usage is expected.

## 3. Current Project State
- **Location**: `/home/adam/shfi-hk/myapp`
- **Framework**: Expo (React Native) + TypeScript
- **Networking**: Axios instance targets `http://hack.marrb.net:3000`
- **Auth endpoints used**:
  - `POST /auth/register`
  - `POST /auth/login`

## 4. Next Steps
- Replace temporary homepage state view with proper navigation/routing stack.
- Add API tests and integration checks for auth flow.
