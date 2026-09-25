# User Registration & Password Authentication

- **Status**: done
- **Priority**: 🟡 High
- **Depends on**: none
- **Files**:
  - `packages/server/src/routes/auth.ts`
  - `packages/server/src/services/UserService.ts`
  - `packages/server/src/db/schema.ts`
  - `packages/client/src/network/AuthClient.ts`
  - `packages/client/src/scenes/LoginScene.ts`

## Description

Currently, only guest authentication (`POST /api/auth/guest`) and token refresh (`POST /api/auth/refresh`) are functional. Endpoints `POST /api/auth/register` and `POST /api/auth/login` explicitly return HTTP 501 `Not implemented`. The SQLite `users` table already defines a `passwordHash` column, but credential storage and verification have not been built. Furthermore, `LoginScene.ts` in the Phaser client only offers an "ENTER AS GUEST" button.

## Tasks

- [x] **Password Security & Service**:
  - Implement secure password hashing & verification in `UserService.ts` (using Node.js standard `crypto.scrypt` or `argon2`/`bcrypt`).
  - Add input validation: username (3-20 characters, alphanumeric/underscore) and password (minimum 8 characters).
- [x] **Authentication Endpoints**:
  - In `packages/server/src/routes/auth.ts`:
    - Implement `POST /api/auth/register`: validate payload, verify username uniqueness, hash password, insert user record, generate JWT pair, return tokens + user profile.
    - Implement `POST /api/auth/login`: validate credentials, lookup user, compare password hash, issue JWT pair, return tokens + user profile.
- [x] **AuthClient Support**:
  - Add `register(username, password)` and `login(username, password)` methods to `AuthClient.ts`.
  - Store tokens and user profile securely in local storage / memory.
- [x] **Client LoginScene UI**:
  - Update `packages/client/src/scenes/LoginScene.ts` to support 3 modes:
    - Guest Login (existing quick start)
    - Sign In (Username + Password)
    - Register (Username + Password + Confirm Password)
  - Provide clear validation feedback on errors (invalid credentials, duplicate username, etc.).
- [x] **Tests**:
  - Unit tests for password hashing & verification.
  - API tests in `packages/server/tests/routes/auth.test.ts` for registration and login flows (including invalid credentials, duplicate username).
