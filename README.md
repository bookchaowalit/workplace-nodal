# NODAL — Shared Office + Engineering Signals

A local, persistent team office: accounts and invitations, shared rooms,
click/keyboard movement, presence, room messages and optional LiveKit calls.
Engineering signals remain available in standard, spatial and graph projections.

## Use it now on this machine

Node.js >=20.9 and pnpm are required. For voice/video, Docker must be running.

```bash
pnpm install
pnpm office:media
```

Open **http://127.0.0.1:3400/office**. Create the first owner account, then create
a one-use invitation. Open an incognito window or another browser, choose
“มีรหัสเชิญเข้าทีม”, and create a second account using that invitation.

- Pick a room and click the floor or use arrow keys to move.
- Presence and messages update every two seconds. Presence expires after 30
  seconds without a heartbeat.
- Click “เข้าร่วมเสียง / วิดีโอ” to join a call. Microphone and camera start off.
  The call controls offer mic, camera, device selection and screen sharing.
- When a call is open, “เสียงตามระยะ” scales each remote participant's audio
  from the shared floor coordinates; it can be disabled locally for a room-wide
  conversation. This is a client-side room pilot, not a proximity SFU policy.
- Moving to another room leaves the current call. Joining the next call remains
  an explicit action; there is no proximity-triggered recording or auto-join.
- Open Engineering signals to inspect the earlier cited fixture data.
  A signed-in owner can persist approval; ordinary members cannot approve.
  GitHub/Linear/deployment/merge/rollback writes remain disabled.

`office:media` runs a pinned LiveKit Docker image bound to loopback, creates
random local media credentials in a private ignored file, injects them into the
web process and cleans up the media container/config on exit. It uses a separate
public-image Docker config so an unrelated credential helper is not required.
Ports 3400, 7880, 7881 and UDP 7882 must be free.

Without Docker or when calls are unnecessary:

```bash
pnpm office:dev
```

The office still supports accounts, invitations, presence, movement and chat;
calls show an explicit unconfigured state. Stop with Ctrl+C.

## Share on the same LAN

After creating the first owner on loopback, a nearby teammate can join from a
second device without exposing the app to the internet. Run the office server
with an explicit LAN bind:

```bash
pnpm office:lan
```

The launcher prints the detected LAN URL. This mode shares the durable local
PGlite directory with every browser reaching this machine; it is still a
single-process development pilot, not a hosted deployment. Create the owner
while running `pnpm office:dev` from `http://127.0.0.1:3400/office` first. The
LAN launcher deliberately disables first-owner bootstrap, even if someone
sends a forged localhost `Origin` header.

For LAN voice/video, use the pinned local LiveKit server and advertise the
machine's LAN address explicitly (replace the example address):

```bash
NODAL_MEDIA_HOST=192.168.1.20 pnpm office:media:lan
```

This binds the web and media ports to the local network. The firewall should
allow TCP 3400, TCP 7880–7881 and UDP 7882 only on the trusted LAN. Do not use
these commands as an internet deployment; use the hosted Postgres/HTTPS/WSS
configuration below instead. Browsers will keep the call button disabled on an
ordinary `http://<LAN-IP>` page because microphone and camera require a secure
context; use the HTTPS launcher for a real-device LAN rehearsal:

```bash
NODAL_MEDIA_HOST=192.168.1.20 pnpm office:media:lan:https
```

The HTTPS launcher generates a 30-day development certificate in
`.nodal/certs/` and proxies both the Next app and LiveKit signaling through the
printed HTTPS URL. Install `.nodal/certs/office.crt` as trusted on each pilot
device, or provide an existing certificate pair with `NODAL_TLS_CERT` and
`NODAL_TLS_KEY`. The TLS proxy uses the same bind host as the launcher: local
HTTPS stays on loopback and LAN HTTPS binds only when `--lan` is explicit. The
generated certificate is for local rehearsal only; use a publicly trusted
certificate and WSS/TURN for internet deployment.

## Persistence and existing fixture mode

Shared Office explicitly opts into a single-process local PGlite database at
`.nodal/office`, with Drizzle migrations applied at startup. It is real durable
local data, not a browser fixture. Restarting preserves accounts and messages.
Do not start two office servers against the same local data directory.
`NODAL_LOCAL_DATA_DIR` can select a separate local directory; E2E tests do this.

`pnpm dev` without DATABASE_URL or local-office opt-in still runs the V1 fixture.
The fixture's approval resets on refresh and the UI/API say ephemeral.
When Shared Office is enabled, the root opens /office and /engineering plus the
workspace/approval APIs require a valid session.

## Internet/team deployment (not deployed by this change)

The local launcher is intentionally bound to this machine; an incognito window
is a second local participant, not proof that remote teammates can connect.

For an internet pilot, deploy Next.js behind HTTPS, configure a dedicated
Postgres database and a reachable LiveKit WSS/WebRTC service, then supply private
environment values:

- DATABASE_URL: runtime Postgres connection.
- DATABASE_URL_UNPOOLED: direct migration connection.
- NODAL_APP_ORIGIN: exact public HTTPS application origin.
- LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET: private media configuration.
- NODAL_OWNER_USERNAME, NODAL_OWNER_NAME, NODAL_OWNER_PASSWORD: initial owner
  bootstrap only; remove these values after setup.
- SENTRY_DSN (optional): server-side error reporting. Unset means nothing is
  sent, which is the default for loopback and LAN pilots. See "Error reporting".

```bash
pnpm db:migrate
pnpm office:bootstrap
pnpm build
pnpm start
```

Do not enable NODAL_LOCAL_PILOT in public deployments. Owner bootstrap is a
one-time operator command; public signup requires a valid invitation.
Runtime credentials are never returned to the client. Media join tokens are
short-lived and scoped to the authenticated tenant/member/room.

Useful references: [LiveKit local hosting](https://docs.livekit.io/transport/self-hosting/local/)
and [tokens and grants](https://docs.livekit.io/frontends/reference/tokens-grants/).

## Error reporting

API routes turn unexpected failures (database down, migration drift) into a
generic `office_unavailable` / `workspace_unavailable` 503 so nothing internal
reaches the browser. Those errors, and any uncaught route error, are reported to
Sentry by the Node.js server only (`instrumentation.ts`, `sentry.server.config.ts`,
`src/observability/`), and only when `SENTRY_DSN` is set on the host. There is no
browser SDK, tracing, replay or breadcrumbs. `beforeSend` is an allowlist that
keeps the exception type and code location. Messages pass only if they are one of
the app's static error codes, or Drizzle `Failed query:` text with `params:` removed
and quoted literals replaced by `'?'` (max 300 characters); any other message
(Postgres messages quote user values) is sent as `[redacted]`, linked cause errors
keep their type only, and the Postgres SQLSTATE of the error chain is sent as the
`pg_code` tag. Request URLs, headers, cookies, bodies, user, host name and frame
locals are dropped. Expected 4xx errors are not reported.

## Engineering persistence

18 Drizzle tables now include the V1 canonical entities/citations and five
office tables for members, sessions, invitations, presence and messages.
Tenant composite keys and foreign keys protect organization boundaries.

GitHub/Linear adapters still accept synthetic local payloads only. Import
with `pnpm db:import-fixtures` against a migrated/seeded Postgres database.
Duplicate events are idempotent; older source versions do not rewind work.
Database connectivity and simulated source freshness are displayed separately.
Room messages carry a client request id and are safe to retry after a timeout;
the same member cannot create a duplicate message with the same id.
Browser office requests have an eight-second abort boundary and runtime shape
checks for session, state, invite and media responses. Malformed API responses
fall back to a visible unavailable state. Presence polling exposes
online/offline status and retries automatically; the E2E flow simulates dropped,
non-JSON and wrong-shape state responses before recovery.

Decision/tasks have separate proposed → approved_for_sync → synced states.
V1/V2 still cannot execute the synced transition. Verified human owner identity
can now reach approved_for_sync with an audit event; verification remains pending.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
NODAL_TEST_MEDIA=1 pnpm test:e2e
NODAL_TEST_MEDIA=1 NODAL_TEST_HTTPS=1 pnpm test:e2e
```

E2E media tests require Docker and available media ports. The HTTPS variant
starts the local TLS proxy, accepts the generated certificate only inside the
test browser, and verifies WSS signaling. They generate random
test credentials in memory, use an isolated ignored database, and run two
browser contexts with fake camera/mic devices. Traces are disabled to avoid
capturing sessions/passwords. Optional PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
selects an existing Chrome executable.

## Remaining gaps

This is a usable local team-office pilot, not full Gather parity. No map editor,
avatars/assets marketplace, private/locked rooms, moderation,
member removal, password recovery, email verification, SSO or enterprise controls.
All current rooms/messages are visible to all authenticated team members.

Presence uses polling, not a high-frequency multiplayer engine. Local PGlite
requires one Node process and durable disk; use Postgres for a hosted deployment.
Rate limits are process-local. Production needs shared abuse controls, session
and invitation lifecycle management, privacy/retention and backup/restore testing.

LiveKit transport is real when configured. Screen sharing requires browser
permission and is not the same as consent to record; recording is not enabled.
Synthetic media E2E does not validate physical devices or internet NAT/TURN.
Live GitHub/Linear ingestion, immutable source archive and genuine verification
evidence remain unimplemented. No autonomous agent or external engineering
write has been introduced.

See [architecture](docs/ARCHITECTURE.md), [AI workflow](docs/AI-WORKFLOW.md),
[product plan](PRODUCT-PLAN.md) and [Signal Garden design](DESIGN.md).
