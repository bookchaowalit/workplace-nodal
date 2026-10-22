// Server-side error reporting for the NODAL web process (Node.js runtime only).
// Errors only: no tracing, no trace headers, no breadcrumbs, no browser SDK.
// Inert unless SENTRY_DSN is set on the host; local/LAN pilots without it send nothing.
// beforeSend is an allowlist: it rebuilds the event from exception type, message and
// code location only, so request URLs, headers, cookies, bodies, session tokens,
// usernames, room messages, frame locals and the host name are never sent.

type Frame = { filename?: string; function?: string; module?: string; lineno?: number; colno?: number; in_app?: boolean };
type ExceptionValue = {
  type?: string;
  value?: string;
  mechanism?: { type?: string; handled?: boolean };
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
};

const MAX_MESSAGE = 300;
// Drizzle errors read "Failed query: <sql>\nparams: <values>"; the values can be usernames,
// session-token digests or message text, so everything from "params:" on is dropped.
const QUERY_PARAMS = /\s*\bparams:[\s\S]*$/;

function keepMessage(value: string | undefined) {
  return value?.replace(QUERY_PARAMS, "").slice(0, MAX_MESSAGE);
}

function keepFrame(frame: Frame): Frame {
  const { filename, function: fn, module, lineno, colno, in_app } = frame;
  return { filename, function: fn, module, lineno, colno, in_app };
}

function keepException(value: ExceptionValue): ExceptionValue {
  return {
    type: value.type,
    value: keepMessage(value.value),
    mechanism: value.mechanism && { type: value.mechanism.type, handled: value.mechanism.handled },
    stacktrace: value.stacktrace && { frames: (value.stacktrace.frames ?? []).map(keepFrame) },
  };
}

export function scrubEvent<T extends ReportableEvent>(event: T): T {
  const { event_id, timestamp, level, platform, release, environment, exception } = event;
  const kept: ReportableEvent = { event_id, timestamp, level, platform, release, environment };
  if (exception?.values) kept.exception = { values: exception.values.map(keepException) };
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

