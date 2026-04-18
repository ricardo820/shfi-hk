# AUTH Notes (Internal)

## What is implemented now
- Two public authentication endpoints:
  - `POST /auth/register`
  - `POST /auth/login`
- Required fields for both endpoints:
  - `email`
  - `password`
- Password handling:
  - Raw password is never stored.
  - Password is hashed using bcrypt before insert into DB.
- Session/auth token strategy:
  - On successful login, API returns JWT token.
  - Token payload currently includes:
    - `sub` (user id)
    - `email`
  - Token expiration controlled via `JWT_EXPIRES_IN`.

## Data model used right now
- `users` table (auto-created on startup if absent):
  - `id BIGSERIAL PRIMARY KEY`
  - `email TEXT UNIQUE NOT NULL`
  - `password_hash TEXT NOT NULL`
  - `created_at TIMESTAMPTZ DEFAULT NOW()`

## Request/response behavior
- `POST /auth/register`
  - Validates email format and password length (>= 6)
  - Returns `409` if user already exists
  - Returns created user metadata (not password hash)
- `POST /auth/login`
  - Validates payload
  - Returns `401` on bad credentials
  - Returns JWT token and basic user object on success

## How this maps to upcoming user app
When we build the user-facing app, expected flow:
1. User submits email/password to `/auth/register` or `/auth/login`.
2. On login success, frontend stores token (prefer secure httpOnly cookie in production; temporary localStorage/sessionStorage only for quick local MVP).
3. Frontend sends token on protected requests:
   - `Authorization: Bearer <token>`
4. Backend middleware (to be added next) verifies token and loads user context for protected endpoints.

## Important follow-ups before production
- Move schema creation from startup logic to versioned SQL migrations.
- Add auth middleware + refresh/session strategy.
- Add email normalization rules and stronger password policy.
- Add rate limiting / brute-force protection on login endpoint.
- Rotate `JWT_SECRET` and never use fallback secret outside local development.
- Consider moving token transport to secure cookie for browser apps.
