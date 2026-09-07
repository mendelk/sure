# ADR-0001: Threat Model for Browser Authentication and BFF

- **Status:** Accepted
- **Date:** 2026-09-07
- **Ticket:** `t_alt_fnd_006` (Threat-model browser authentication and BFF)
- **Scope:** Browser sessions for the Sure alternate frontend (TanStack Start),
  backed by Sure OAuth access/refresh tokens, mediated by a backend-for-frontend
  (BFF) hosted in the public frontend container, against the internal Rails API.
- **Downstream consumers:** `t_alt_fnd_005` (hardened BFF transport),
  `t_alt_fnd_007` (login/refresh/logout sessions). Both MUST cite the
  `REQ-*` / `CTL-*` IDs below; a security-sensitive ticket may not ship while a
  `Critical` threat in §5 is unmitigated.

All factual claims about current Rails behavior were validated against the
working tree at commit `41e07edb9` (routes in `config/routes.rb`, Doorkeeper
config in `config/initializers/doorkeeper.rb`, session handling in
`app/controllers/concerns/authentication.rb` + `app/controllers/sessions_controller.rb`,
API auth in `app/controllers/api/v1/auth_controller.rb` +
`app/controllers/api/v1/base_controller.rb`, CORS/CSP/rate-limit/filtering in
`config/initializers/`, and the contract in `docs/api/openapi.yaml`).

---

## 1. Context

The alternate frontend is a browser SPA (TanStack Start) served from a public
frontend container. Browsers are hostile territory: any token readable by page
JavaScript is exfiltrable via XSS, and any bearer credential the browser holds
directly can be replayed. The Rails API today issues long-lived Doorkeeper
bearer tokens for native/mobile clients (`POST /api/v1/auth/*`, 30-day
`MobileDevice#issue_token!` tokens, `use_refresh_token`, `force_pkce`,
hashed token secrets). Those tokens are the keys to financial data and MUST
NEVER be exposed to browser JavaScript.

The chosen architecture is therefore a **confidential BFF**: the browser holds
only an opaque, `HttpOnly` session cookie for the BFF's own origin; the BFF
holds the Sure OAuth tokens server-side and proxies allow-listed API calls.
This ADR fixes the decisions, the threats they close, and the testable
requirements and release gates that prove it.

## 2. Trust boundaries

```
┌──────────┐  (1) cookie only   ┌──────────────┐  (2) mTLS/auth'd net  ┌────────────┐
│ Browser  │ ◄───────────────► │ BFF (public  │ ◄───────────────────► │ Rails API  │
│ (untrust)│  same-origin,     │ frontend      │  server-to-server,    │ (internal, │
│          │  CSRF-protected   │ container)    │  secrets stay here    │  trusted)  │
└──────────┘                   └──────────────┘                       └────────────┘
      ▲                                ▲ (3) reverse proxy terminates TLS,
      │ (4) provider redirects         │     sets HSTS, strips spoofed
      │ leave the boundary and         │     X-Forwarded-*, rate-limits edge
      │ MUST return via fixed          ▼
      │ allow-listed callbacks  ┌──────────────┐
      └──────────────────────── │ IdP / OAuth  │ (third-party, untrusted input)
                                │ providers    │
                                └──────────────┘
```

- **B1 — Browser ⇄ BFF (public, untrusted client).** Only attack surface the
  user touches. Browser holds zero Sure tokens; only the BFF session cookie.
- **B2 — BFF ⇄ Rails API (server-to-server).** Confidential. Carries Sure
  access tokens, refresh tokens, and the BFF's own API credentials. Never
  traverses the browser. Assumes private network / authenticated egress; the
  reverse proxy guarantees the BFF's upstream host allow-list cannot be
  overridden per-request (no `X-Forwarded-Host` trust).
- **B3 — Reverse proxy (edge).** Terminates TLS, enforces HSTS, applies edge
  rate limits, strips spoofable forwarding headers, forwards only to known
  upstreams. Rails runs with `RAILS_FORCE_SSL=true` / `RAILS_ASSUME_SSL=true`
  defaults (`config/environments/production.rb:44-49`).
- **B4 — Provider redirects (third-party).** OIDC/OAuth callbacks
  (`/auth/:provider/callback`, mobile/desktop SSO deep links such as
  `sureapp://oauth/callback`) are untrusted input: `code`, `state`, and
  provider attribute payloads are attacker-influencable until verified.

## 3. Lifecycle model (what MUST happen)

### 3.1 Login

1. Browser posts credentials to the **BFF**, never to the Rails API directly.
2. BFF exchanges them server-side against `POST /api/v1/auth/login`
   (validated: exists at `config/routes.rb:644`; requires device info,
   honors MFA via `otp_code`, returns `access_token` + `refresh_token`).
3. BFF creates a fresh server-side session, stores the Sure token pair
   **encrypted at rest** (see §4, D2), and sets the session cookie (§4, D3).
4. BFF **rotates any pre-login session identifier** (fixation defense, §5 T-XSS/T-FIX).

MFA-gated accounts return `mfa_required: true` (validated in
`auth_controller.rb#login`); the Alt Frontend v1 explicitly does **not**
support completing MFA in-browser (per `t_alt_fnd_007` unsupported-MFA state)
and MUST surface "unsupported" rather than bypass it (REQ-AUTH-07).

### 3.2 Refresh rotation and concurrency

Validated current server behavior (`auth_controller.rb#refresh`): refresh
looks up the token by refresh secret (`by_refresh_token`), rejects
missing/revoked tokens with 401, then under `user.with_lock` +
`access_token.with_lock` mints a new 30-day token and revokes the old one,
updating device `last_seen_at`. The desktop/mobile SSO one-time codes are
claimed by atomic cache-delete so exactly one redeemer wins
(`sessions_controller.rb#desktop_exchange`, `auth_controller.rb#sso_exchange`).

Decisions:

- **Rotation, not reuse:** every successful refresh invalidates the presented
  refresh token (reuse detection: a second presentation of the same refresh
  token is treated as suspected theft → revoke the whole session family,
  REQ-AUTH-03).
- **Single-flight under concurrency:** the BFF MUST serialize refresh per
  session (mutex / distributed lock on the session id). Parallel requests that
  observe expiry wait on the single refresh; exactly one upstream
  `POST /api/v1/auth/refresh` fires; losers retry once with the new token
  (REQ-AUTH-04). This mirrors the server's row-lock pattern and the
  atomic-claim pattern of the SSO codes.
- **Retry-once rule:** on 401-with-`invalid_token` semantics the BFF refreshes
  once and retries the eligible (idempotent or explicitly allow-listed)
  request exactly once; a second 401 forces logout, never an infinite loop
  (REQ-AUTH-05).

### 3.3 Logout / revocation

Validated gap: **the Rails API has no OAuth token revocation/logout endpoint**
— `config/routes.rb:643-649` exposes signup/login/refresh/sso_*/enable_ai only,
and `AuthController` has no `logout`/`revoke` action. Web logout exists only
for cookie sessions (`SessionsController#destroy`; destroys the `Session`
record, clears IdP state, federated-logout redirect where configured).

Decisions:

- BFF logout MUST be three-step and atomic-from-the-user's-view: (a) destroy
  the BFF server-side session and clear the cookie; (b) call the new explicit
  revocation endpoint (REQ-API-01: `t_alt_fnd_007` adds or extends the Rails
  contract, e.g. `POST /api/v1/auth/logout|revoke`, with Minitest behavior
  coverage + docs-only rswag + regenerated OpenAPI per repo API guidelines);
  (c) until REQ-API-01 lands, best-effort equivalent = discard tokens from BFF
  storage AND revoke at the Doorkeeper layer via the device/session teardown
  path — never "delete cookie only".
- Revocation MUST propagate on: explicit logout, invalid-refresh, reuse
  detection, deactivation, role demotion (where policy requires), password
  change, and admin `permanently_remove!` / `revoke_all_credentials!`.

### 3.4 Expiry

- Sure access tokens: 30 days for device-issued tokens (`MobileDevice#issue_token!`,
  `auth_controller.rb#refresh`); Doorkeeper global default is 1 year
  (`doorkeeper.rb:111`) — the BFF MUST NOT depend on the global default and
  MUST treat `expires_in` from the token response as authoritative.
- BFF session lifetime MUST be ≤ the refresh-token lifetime and SHOULD be
  shorter (idle timeout + absolute lifetime, REQ-SESS-02). Expired BFF sessions
  are destroyed server-side; stale cookies are rejected without consulting the
  upstream (fail closed).
- Clock skew tolerance ≤ 60s, applied only to expiry comparison, never to
  extend validity.

### 3.5 Account deactivation

Validated: API OAuth path (`base_controller.rb#authenticate_oauth`) and API-key
path both reject inactive users with 401 `Account has been deactivated`; web
cookie path (`authentication.rb#find_session_by_cookie`) destroys the session
record and deletes the cookie when the user is inactive. `User#deactivate`
flips `active=false`; `User#revoke_all_credentials!` (revoke tokens, destroy
sessions/devices/api_keys/webauthn/oidc) currently runs only inside
`permanently_remove!`, **not** on plain `deactivate` (validated gap).

Decisions: deactivation MUST take effect within the BFF's next upstream call
at the latest — the BFF re-checks on refresh and on a bounded revalidation
interval (REQ-AUTH-06), destroys the local session on 401-deactivated, and
`t_alt_fnd_007` MUST wire plain-deactivate to credential teardown
(REQ-API-02; no silent "API rejects but tokens stay valid until expiry"
window beyond the revalidation interval).

### 3.6 Role changes

Validated gap: nothing re-checks `User#role` (guest/member/admin/super_admin)
for live sessions/tokens. Decisions: role is enforced server-side per request
by Rails (Pundit/authorization), never trusted from the BFF or cookie;
privilege **demotion** (admin→member, any→guest, super_admin loss) MUST
trigger BFF session revalidation and, for configured sensitive demotions,
immediate session termination + revocation (REQ-AUTH-06). Elevation takes
effect without forcing re-login but MUST NOT grant cached allow-list
decisions made under the old role.

## 4. Storage, cookie, and transport decisions

- **D1 — Tokens never reach the browser.** No Sure access/refresh token,
  API key, or token-derived value in cookies readable by JS, `localStorage`,
  `sessionStorage`, URLs, or response bodies to the browser. Cookie value is
  an opaque random session id only. (REQ-SESS-01; CTL-SEC-01 scans for token
  patterns in BFF→browser traffic.)
- **D2 — Encrypted server-side session storage.** BFF sessions (containing the
  Sure token pair) live server-side (Redis/DB-backed store, never a
  client-side/JWT-cookie session), encrypted at rest with ActiveRecord-style
  envelope encryption / KMS-backed key, with key id versioned for rotation
  (see D8). Session payloads MUST NOT include anything the browser does not
  need (no full user PII beyond display minimum).
- **D3 — Cookie attributes.** `__Host-` prefixed name; `HttpOnly`; `Secure`;
  `SameSite=Lax` (strict for the session cookie is permitted if no top-level
  provider-return flow needs Lax); `Path=/`; no `Domain` attribute (host-only);
  short `Max-Age` aligned with idle timeout. Rationale: current Rails web
  sessions set `cookies.signed.permanent[:session_token] = { httponly: true }`
  (`authentication.rb:49`) with **no explicit `Secure`/`SameSite`** in code —
  production relies on `force_ssl`/`assume_ssl` defaults. The BFF MUST set all
  four attributes explicitly rather than inherit framework defaults
  (REQ-SESS-03).
- **D4 — CSRF.** Same-origin BFF cookies + `SameSite=Lax` is necessary but not
  sufficient: all BFF mutations require an explicit anti-CSRF token
  (double-submit or synchronized token) validated server-side; `Origin`/`Host`
  enforcement; no state-changing GETs. API-to-API calls keep skipping CSRF
  (`BaseController` skips `verify_authenticity_token`) — that exemption stays
  strictly server-side. (REQ-TRAN-01.)
- **D5 — XSS containment.** CSP enforced (not report-only) on BFF-served pages
  — validated gap: `config/initializers/content_security_policy.rb` is
  **entirely commented out** (no enforced CSP today); strict `script-src`
  without inline scripts, nonces for any framework-injected scripts; output
  encoding by default; no `dangerouslySetInnerHTML` for user/financial content;
  defense-in-depth argument for D1 (even a successful XSS finds no Sure token
  to steal). (REQ-TRAN-02.)
- **D6 — SSRF.** The BFF's upstream base URL is deployment configuration, not
  request input: reject absolute URLs, protocol-relative URLs, path escapes
  (`..`, backslashes, encoded slashes), and honor only an allow-list of
  `/api/v1/*` paths/methods/content-types; strip `X-Forwarded-*` from inbound
  requests (reverse proxy re-sets them); outbound fetch pinned to the
  configured Sure origin with timeout + body caps. Validated context: current
  CORS allows `origins "*"` for `/api/*`, `/oauth/*`, `/sessions/*`
  (`config/initializers/cors.rb`) — acceptable for native clients, but the
  browser path MUST be same-origin BFF only and MUST NOT depend on CORS.
  (REQ-TRAN-03; owned by `t_alt_fnd_005`.)
- **D7 — Fixation / replay / redirects.**
  - Fixation: rotate session id at login and at privilege change; never accept
    a client-supplied session id (REQ-SESS-04).
  - Replay: refresh tokens single-use with reuse detection (§3.2); SSO
    one-time codes single-use with atomic claim (already the server pattern —
    extend it, don't reinvent it); no request replay beyond the single
    retry-once rule (§3.2).
  - Open redirects: after-login `next` targets restricted to same-origin
    relative paths against an allow-list; provider callbacks registered
    exactly (Doorkeeper already forbids `javascript:` redirect URIs,
    `doorkeeper.rb:316`, while permitting app schemes such as `sureapp://` —
    keep; BFF MUST NOT add `allow_other_host` redirects with user input)
    (REQ-TRAN-04).
- **D8 — Secret rotation.** Versioned keys for: session-encryption keys,
  BFF-to-Rails API credentials, OAuth application secrets (Doorkeeper app
  secrets are hashed — `hash_application_secrets`, `doorkeeper.rb:219`), and
  cookie-signing secrets. Dual-accept window (N and N+1) with a dated
  rotation runbook; revocation lists bumped on rotation; rotation rehearsed
  before release (REQ-OPS-02, CTL-REL-03).

## 5. Threat table (residual: no unresolved Critical)

Severity = worst-case impact × exploitability **after** the cited requirement
lands. Every `Critical` below is closed by a MUST requirement in §7.

| ID | Threat | Severity | Mitigated by |
|----|--------|----------|--------------|
| T-TOK-LEAK | Sure tokens disclosed to browser JS / storage / cache | Critical | D1, REQ-SESS-01, CTL-SEC-01 |
| T-CSRF | Cross-site request forgery on BFF mutations | Critical | D4, REQ-TRAN-01 |
| T-SSRF | BFF turned into proxy to arbitrary upstreams | Critical | D6, REQ-TRAN-03 |
| T-FIX | Session fixation (pre-login id retained) | High | D7, REQ-SESS-04 |
| T-REPLAY | Refresh / SSO-code replay, concurrent double-refresh | High | §3.2, REQ-AUTH-03/04 |
| T-REDIR | Open redirect via `next` or provider callback | High | D7, REQ-TRAN-04 |
| T-LOG | Tokens/secrets in logs, error pages, APM | High | D9, REQ-OPS-01 |
| T-CACHE | Personalized financial data in shared caches | High | D10, REQ-TRAN-05 |
| T-XSS | Stored/reflected XSS exfiltrating session or data | High* | D1+D5, REQ-TRAN-02 (*residual High: XSS still harms in-session actions; token theft reduced to session-cookie theft, cookie is HttpOnly+SameSite) |
| T-DEACT | Deactivated user keeps acting on live tokens | High | §3.5, REQ-AUTH-06, REQ-API-02 |
| T-ROLE | Stale privilege after role demotion | High | §3.6, REQ-AUTH-06 |
| T-ROT | Stale/compromised secrets with no rotation path | Medium | D8, REQ-OPS-02 |
| T-PROV | Malicious provider payload (OIDC attrs, deep-link params) | Medium | B4 validation, REQ-AUTH-07 |
| T-RATE | Credential-stuffing / token-guessing at edge | Medium | Inherited: Rack::Attack throttles on `/oauth/token`, `/register`, MFA/passkey, admin (`rack_attack.rb`; enabled in prod/staging); BFF adds login/refresh throttles REQ-TRAN-06 |
| T-CSP-GAP | No enforced CSP in Rails today | Medium | D5, REQ-TRAN-02 (BFF ships its own enforced CSP regardless) |
| T-CORS-WIDE | `origins "*"` on API/OAuth/session endpoints | Medium | Contained: browser path is same-origin BFF only (D6); changing native-client CORS is out of scope but recorded |

- **D9 — Logging/cache hygiene (normative):** `filter_parameters` already
  covers `:passw, :token, :secret, :otp`, OAuth tokens, verifiers, device
  codes (`filter_parameter_logging.rb`) — BFF MUST extend the same denylist to
  its own session ids/refresh tokens, never log request/response bodies on
  auth paths, and propagate `X-Request-Id` without logging credentials.
- **D10 — Cacheability:** authenticated BFF responses carry
  `Cache-Control: private, no-store` (or `no-cache` + `private` where
  revalidation is intended); no personalized payload in shared/proxy caches;
  `Vary: Cookie, Authorization` where caching applies at all.

## 6. Non-goals / explicit out-of-scope

- Changing native/mobile OAuth flows, token lifetimes for existing clients, or
  the `origins "*"` CORS posture for non-browser clients.
- Completing MFA inside the Alt Frontend v1 (unsupported-MFA state instead).
- A general API gateway; the BFF proxies only the allow-listed paths
  `t_alt_fnd_005` needs.

## 7. Implementation requirements (testable; downstream MUST cite)

Auth & session:

- **REQ-AUTH-01** BFF login exchanges credentials server-side only; Sure
  tokens never enter any browser response. Test: login E2E asserts no token
  pattern in Set-Cookie/body/storage.
- **REQ-AUTH-02** BFF session id is a fresh ≥128-bit random value created at
  login; pre-login ids are never honored.
- **REQ-AUTH-03** Refresh rotation is single-use; presenting an already-used
  refresh token revokes the session family and forces logout. Test: use → OK;
  replay old → 401 + family revoked.
- **REQ-AUTH-04** Concurrent expiry triggers exactly one upstream refresh per
  session (single-flight); parallel requests converge. Test: N-way concurrent
  expired-request test asserts one `POST /api/v1/auth/refresh`.
- **REQ-AUTH-05** At most one automatic retry after a successful refresh; a
  second 401 logs out. Test: persistent-401 test asserts no retry loop.
- **REQ-AUTH-06** Deactivation/demotion enforced by next upstream call:
  refresh + bounded revalidation (≤5 min) re-check; 401-deactivated destroys
  the BFF session. Tests: deactivate-mid-session, demote-admin-mid-session.
- **REQ-AUTH-07** MFA-gated and untrusted-provider payloads fail closed
  (unsupported-MFA UI; strict OIDC/code validation incl. PKCE S256 format as
  in `desktop_sso_start`).

Session & cookie:

- **REQ-SESS-01** No Sure token/API key in any browser artifact (cookie,
  storage, URL, body). Automated scan (CTL-SEC-01).
- **REQ-SESS-02** BFF idle timeout + absolute lifetime ≤ refresh-token
  lifetime; expired sessions destroyed server-side; stale cookies rejected.
- **REQ-SESS-03** Cookie: `__Host-` prefix, `HttpOnly`, `Secure`,
  `SameSite=Lax` (or Strict), host-only, `Path=/`. Test asserts attributes.
- **REQ-SESS-04** Session id rotates at login and privilege change; client-set
  ids ignored.

Transport:

- **REQ-TRAN-01** Mutations require anti-CSRF tokens + origin checks; no
  state-changing GET. Tests: cross-origin POST without token → 403.
- **REQ-TRAN-02** Enforced CSP on BFF pages; no inline scripts; XSS test
  suite (stored + reflected vectors) asserts no execution / no token access.
- **REQ-TRAN-03** SSRF allow-list: relative `/api/v1/*` paths only; absolute
  URLs, escapes, and forwarded-header overrides rejected. Tests per
  `t_alt_fnd_005` verification list.
- **REQ-TRAN-04** Redirects: same-origin relative `next` allow-list only.
  Tests: `//evil`, `https://evil`, encoded variants rejected.
- **REQ-TRAN-05** Authenticated responses `private, no-store`; shared-cache
  test asserts no personalized body cached.
- **REQ-TRAN-06** BFF login/refresh throttles independent of upstream
  Rack::Attack (which is prod/staging-only and IP/token-keyed).

Operations:

- **REQ-API-01** Rails exposes explicit revocation/logout for OAuth tokens
  (or documents the blessed equivalent); Minitest behavior coverage +
  docs-only rswag + regenerated `docs/api/openapi.yaml`.
- **REQ-API-02** Plain `User#deactivate` tears down live credentials
  (or BFF revalidation interval is formally accepted as the window).
- **REQ-OPS-01** No credentials in logs/errors/APM; filter-list extended to
  BFF session/refresh secrets; structured redacted errors only.
- **REQ-OPS-02** Versioned secrets with dual-accept rotation runbook;
  rotation rehearsed pre-release.

## 8. Release controls (gates)

- **CTL-SEC-01** Token non-disclosure scan green (no Sure-token patterns in
  BFF→browser traffic, cookies, or stored artifacts).
- **CTL-SEC-02** Security test matrix green: login, rotation, concurrent
  expiry (single refresh), logout/revocation, stale cookie, deactivation,
  demotion, CSRF/SSRF/XSS/redirect suites.
- **CTL-SEC-03** `bin/brakeman` clean on touched Rails surfaces; `bin/rubocop`
  clean.
- **CTL-API-01** Any Rails endpoint change ships Minitest behavior coverage,
  docs-only rswag (`X-Api-Key` pattern, no behavioral asserts in
  `spec/requests/api/v1/`), and regenerated OpenAPI — per repo API guidelines.
- **CTL-REL-01** Deployment checklist: `RAILS_FORCE_SSL`/`RAILS_ASSUME_SSL`
  true behind the TLS-terminating proxy; upstream allow-list pinned to config;
  HSTS present; spoofable forwarding headers stripped.
- **CTL-REL-02** Cache/logging audit: response-header sample + log sample
  reviewed for leakage.
- **CTL-REL-03** Secret-rotation rehearsal recorded (D8 keys).
- **CTL-THREAT-01** This table re-reviewed at release; any new Critical
  blocks ship. Residual Highs (notably T-XSS in-session impact) are accepted
  with D1+D5 containment, not resolved — recorded here, not hidden.

## 9. Consequences

- The BFF becomes a stateful confidential service (session store + encryption
  keys + rotation runbook) — operational cost accepted in exchange for keeping
  bearer tokens off the browser.
- Native/mobile clients are untouched; no Doorkeeper lifetime/CORS changes
  required by this ADR.
- `t_alt_fnd_005`/`t_alt_fnd_007` inherit concrete, citable IDs instead of
  prose — traceability is the point.

## 10. Open risks (non-blocking, tracked)

1. Native-client CORS remains `*` — accepted (out of scope), revisit if the
   BFF ever depends on CORS.
2. `User#deactivate`-without-teardown window until REQ-API-02 lands —
   bounded by REQ-AUTH-06 revalidation; tracked, not critical.
3. Doorkeeper 1-year global `access_token_expires_in` vs 30-day device tokens
   — BFF treats per-response `expires_in` as authoritative; a future cleanup
   should scope the global default.
4. `force_ssl_in_redirect_uri false` (needed for `sureapp://` app schemes) —
   safe only alongside exact redirect-URI registration; BFF adds no custom
   schemes.
