# Backoffice Browser Auth Rollout

## Goal

Move `admin` and `dispatcher` to a browser/PWA-capable workflow on the same Render deployment so operators can:

- open backoffice in a separate browser window;
- minimize that window like a normal Windows application;
- keep Telegram chats visible at the same time;
- preserve Telegram as the source of identity and role mapping.

The passenger flow (`index`, `booking`, `profile`) stays Telegram-first and is not expanded to browser auth in phase 1.

## Current Constraints

- Production API access for protected routes depends on valid Telegram `initData`.
- `admin` and `dispatcher` frontend pages assume `window.Telegram.WebApp`.
- Dispatcher realtime WebSocket auth also depends on Telegram `initData`.
- Roles and route scoping already live on the server and must remain server-enforced.

## Target Architecture

### Identity Model

- Telegram remains the identity provider.
- Browser/PWA gets a short-lived one-time login ticket issued from a valid Telegram session.
- The ticket is exchanged for a server-side browser session stored in the database.
- Browser requests use a secure `HttpOnly` cookie instead of Telegram headers.

### Phase 1 Scope

- Add browser auth only for:
  - `admin.html`
  - `dispatcher.html`
  - `/api/admin/*`
  - `/api/dispatcher/*`
  - `/api/user/roles`
  - dispatcher WebSocket
- Do not widen browser auth to passenger profile, saved passengers, or booking ownership flows yet.

## Auth Flow

### 1. Telegram -> browser handoff

1. User opens `admin` or `dispatcher` inside Telegram Mini App.
2. User clicks `Open in browser`.
3. Frontend calls `POST /api/auth/browser-ticket` with Telegram-authenticated headers.
4. Backend verifies Telegram identity and role.
5. Backend creates a one-time ticket with TTL 30-60 seconds.
6. Frontend opens `backoffice-login.html?ticket=...&next=admin` or `...next=dispatcher` in the external browser.

### 2. Browser login exchange

1. `backoffice-login.html` reads `ticket`.
2. It calls `POST /api/auth/browser-exchange`.
3. Backend validates the ticket, role, expiry, and one-time-use rules.
4. Backend creates a browser session and sets a secure `HttpOnly` cookie.
5. Browser is redirected to `admin.html` or `dispatcher.html`.

### 3. Normal browser session

- Browser requests rely on cookie auth.
- Backoffice dependencies accept either:
  - browser session cookie; or
  - Telegram auth headers.
- Server continues to enforce current role and permission rules on every request.

### 4. Session expiry

- If browser session is missing or expired:
  - backoffice UI shows a dedicated sign-in screen;
  - user re-enters from Telegram via handoff;
  - no silent fallback to insecure local storage IDs.

## Data Model

### `browser_login_tickets`

Fields:

- `token_hash`
- `telegram_user_id`
- `target`
- `created_at`
- `expires_at`
- `used_at`
- `used_by_ip`
- `used_user_agent`

Rules:

- one-time use only;
- expires quickly;
- never store raw ticket in DB.

### `browser_sessions`

Fields:

- `session_hash`
- `telegram_user_id`
- `created_at`
- `last_seen_at`
- `expires_at`
- `revoked_at`
- `auth_method`
- `user_agent`
- `ip_address`

Rules:

- cookie stores only the raw opaque session token;
- DB stores only the hash;
- revoke on logout;
- optionally rotate on sensitive auth events later.

## Security Rules

### Required

- Use `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Validate current role on every request, not only on login.
- Keep ticket TTL short.
- Invalidate ticket immediately after exchange.
- Clear ticket from browser URL with `history.replaceState`.
- Never treat `X-Telegram-User-Id` alone as trusted in production.

### Strongly Recommended

- Add logout endpoint.
- Add session status endpoint.
- Add activity touch with bounded frequency.
- Add origin checks for mutating cookie-auth requests.
- Add audit log entries for browser login, logout, and failed exchange.

## WebSocket Plan

Dispatcher realtime must support browser auth too.

Phase 1 approach:

- accept browser session cookie in `/ws/dispatcher/{dispatcher_id}`;
- fallback to Telegram `initData` for existing Mini App flow;
- allow admin browser sessions to subscribe to all routes;
- return explicit close codes when session is invalid or role changed.

## Main Risks And Mitigations

### Risk: role removed while session is still active

Mitigation:

- server re-checks `is_admin`, dispatcher scope, and permissions on each request and websocket auth.

### Risk: ticket leakage through URL history/logs

Mitigation:

- short TTL;
- one-time use;
- hash-only storage;
- remove ticket from visible URL after exchange.

### Risk: shared laptop session hijack

Mitigation:

- idle timeout;
- logout button;
- revocation support;
- future session list and logout-all.

### Risk: dispatcher page works but realtime does not

Mitigation:

- implement session-aware WebSocket in the same rollout;
- show visible reconnect/session-expired state in UI.

### Risk: breaking passenger booking

Mitigation:

- keep passenger API on Telegram auth only in phase 1;
- limit browser session support to backoffice routes.

## Render / Deployment Notes

- No new Render service is required.
- Reuse the existing domain and deployment.
- Browser backoffice pages are opened directly from the same Render domain.
- Existing Telegram Mini App continues to work.
- New environment variables should have safe defaults so current production does not break before rollout is finished.

## Implementation Order

1. Add DB models and Alembic migration for tickets and sessions.
2. Add browser auth service and API endpoints.
3. Make backoffice HTTP dependencies accept browser session or Telegram auth.
4. Make dispatcher WebSocket accept browser session or Telegram auth.
5. Add `backoffice-login.html` and session-aware `admin`/`dispatcher` boot flow.
6. Add `Open in browser` actions from Telegram pages.
7. Add tests for ticket exchange, protected access, logout, and websocket auth fallback.

## Acceptance Criteria

- Admin can open backoffice from Telegram in an external browser.
- Dispatcher can open backoffice from Telegram in an external browser.
- Browser session works without Telegram WebApp context after login.
- Window can be minimized as a normal browser/PWA app.
- Telegram chats remain available independently.
- Admin/dispatcher role changes still take effect server-side.
- Existing passenger booking flow still works inside Telegram.
