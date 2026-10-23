// Server-side error reporting for the NODAL web process (Node.js runtime only).
// Errors only: no tracing, no trace headers, no breadcrumbs, no browser SDK.
// Inert unless SENTRY_DSN is set on the host; local/LAN pilots without it send nothing.
// beforeSend is an allowlist: it rebuilds the event from exception type, message and
// code location only, so request URLs, headers, cookies, bodies, session tokens,
// usernames, room messages, frame locals and the host name are never sent.
// Messages are allowlisted too: the app's own static error codes pass, Drizzle
// "Failed query:" text passes without params and with quoted literals replaced,
// and any other text (Postgres messages quote user values) becomes "[redacted]".
// Linked cause errors keep their type only. The Postgres SQLSTATE code of the
// original error chain is added as the `pg_code` tag.

type Frame = { filename?: string; function?: string; module?: string; lineno?: number; colno?: number; in_app?: boolean };
type ExceptionValue = {
  type?: string;
  value?: string;
  mechanism?: { type?: string; handled?: boolean; source?: string };
  stacktrace?: { frames?: Frame[] };
};
export type ReportableEvent = {
  event_id?: string;
  timestamp?: number;
  level?: string;
  platform?: string;
  release?: string;
  environment?: string;
  exception?: { values?: ExceptionValue[] };
  tags?: Record<string, unknown>;
};
export type EventHint = { originalException?: unknown };

export const REDACTED = "[redacted]";
// Static error codes thrown by this app (src/office, src/domain, src/components).
const APP_CODES: ReadonlySet<string> = new Set([
  "office_not_configured", "office_unavailable", "network_timeout", "approval_failed",
  "workspace_not_initialized", "tenant_mismatch", "owner_not_in_tenant", "invalid_task_state",
  "decision_not_in_tenant", "missing_verification_source", "invalid_decision_state",
  "meeting_not_in_tenant", "source_not_in_tenant", "citation_not_in_tenant", "actor_not_in_tenant",
  "link_not_in_tenant", "invite_required", "invite_invalid_or_expired", "username_unavailable",
  "invalid_credentials", "forbidden", "room_not_found", "join_room_first", "invalid_origin",
  "rate_limited", "invalid_request", "request_too_large",
]);
const FAILED_QUERY = /^Failed query: /;
const QUOTED_LITERAL = /'(?:[^']|'')*'/g;
const SQLSTATE = /^[0-9A-Z]{5}$/;

const MAX_MESSAGE = 300;
// Drizzle errors read "Failed query: <sql>\nparams: <values>"; the values can be usernames,
// session-token digests or message text, so everything from "params:" on is dropped.
const QUERY_PARAMS = /\s*\bparams:[\s\S]*$/;

function keepMessage(value: string | undefined) {
  if (value === undefined) return undefined;
  if (APP_CODES.has(value)) return value;
  if (FAILED_QUERY.test(value)) return value.replace(QUERY_PARAMS, "").replace(QUOTED_LITERAL, "'?'").slice(0, MAX_MESSAGE);
  return REDACTED;
}

function isCause(value: ExceptionValue) {
  return value.mechanism?.type === "chained" || value.mechanism?.source !== undefined;
}

function sqlState(error: unknown): string | undefined {
  for (let current = error, depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && SQLSTATE.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function keepFrame(frame: Frame): Frame {
  const { filename, function: fn, module, lineno, colno, in_app } = frame;
  return { filename, function: fn, module, lineno, colno, in_app };
}

function keepException(value: ExceptionValue): ExceptionValue {
  return {
    type: value.type,
    value: isCause(value) ? undefined : keepMessage(value.value),
    mechanism: value.mechanism && { type: value.mechanism.type, handled: value.mechanism.handled },
    stacktrace: value.stacktrace && { frames: (value.stacktrace.frames ?? []).map(keepFrame) },
  };
}

export function scrubEvent<T extends ReportableEvent>(event: T, hint?: EventHint): T {
  const { event_id, timestamp, level, platform, release, environment, exception } = event;
  const kept: ReportableEvent = { event_id, timestamp, level, platform, release, environment };
  if (exception?.values) kept.exception = { values: exception.values.map(keepException) };
  const pgCode = sqlState(hint?.originalException);
  if (pgCode) kept.tags = { pg_code: pgCode };
  return kept as T;
}

export function sentryOptions(dsn: string | undefined) {
  const configured = Boolean(dsn && dsn.trim());
  return {
    dsn: configured ? dsn : undefined,
    enabled: configured,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: undefined,
    tracePropagationTargets: [] as string[],
    maxBreadcrumbs: 0,
    beforeSend: scrubEvent,
    beforeSendTransaction: () => null,
  };
}

