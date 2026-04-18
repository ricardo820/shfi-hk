# Internal Handoff Note
**Date**: April 18, 2026
**Project**: shfi-hk / myapp (Expo React Native)
**Goal**: Build auth + room management UX with protected API integration.

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
- **Bottom navigation added for non-auth pages**:
  - Implemented shared bottom nav in `App.tsx` for authenticated screens (all pages except login/register).
  - Style follows provided navbar UI example direction with dark glass-like footer.
  - Current items are `Home / Assets / Market / Profile`.
  - Current active item is `Home` for the default rooms page.
  - Login/Register screen intentionally does not render the bottom navigation.
- **Rooms screen implemented as default logged-in page**:
  - Replaced temporary authenticated homepage with a Rooms list screen in `App.tsx`.
  - Screen follows `rooms_ui_example.html` visual direction (dark glass cards, heading, CTA patterns).
  - On login/session restore, app loads rooms via protected `GET /rooms`.
  - Each room item is rendered as a clickable card.
  - If no rooms are returned, only the `Add New Room` button is shown in the list area.
- **Room open/detail flow implemented**:
  - Room cards are clickable and open a dedicated in-app room detail view.
  - Opened room view fetches and displays:
    - Joined users (`GET /rooms/:roomId/members`)
    - Room transactions (`GET /rooms/:roomId/transactions`)
  - Added room-level actions:
    - `Invite by QR`: shows scannable QR for room invite code
    - `Add Transaction`: opens modal and creates transaction with `POST /rooms/:roomId/transactions`
- **Add room flow implemented**:
  - `Add New Room` opens options: `Create New Room` or `Join Existing Room (Scan QR)`.
  - Create flow submits to `POST /rooms` and refreshes room list on success.
  - Join flow uses device camera QR scanning and submits scanned invite code to `POST /rooms/join`, then refreshes list.
  - Added camera permission handling and scanner modal UX for QR join.
- **Rooms API client expanded** (`src/api.ts`):
  - Added typed methods:
    - `listRooms()`
    - `createRoom({ name })`
    - `joinRoom({ inviteCode })`
    - `listRoomMembers(roomId)`
    - `listRoomTransactions(roomId)`
    - `createRoomTransaction(roomId, payload)`
  - Added room-related response and model interfaces.

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
- Connect bottom-nav items to routed screens with real navigation state.
- Add dedicated room detail screen and wire room-card clicks to that page.
- Add API tests and integration checks for auth flow.
