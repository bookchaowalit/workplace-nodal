import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { scrubEvent, sentryOptions, type ReportableEvent } from "../../src/observability/sentry";
import { failure } from "../../src/office/http";
import { OfficeError } from "../../src/office/service";

describe("sentryOptions", () => {
  it("stays disabled when SENTRY_DSN is unset or blank", () => {
    expect(sentryOptions(undefined).enabled).toBe(false);
    expect(sentryOptions("   ").enabled).toBe(false);
    expect(sentryOptions("   ").dsn).toBeUndefined();
  });

  it("reports errors only: no PII, tracing, trace headers or breadcrumbs", () => {
    const options = sentryOptions("https://key@o0.ingest.sentry.io/1");
    expect(options.enabled).toBe(true);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBeUndefined();
    expect(options.tracePropagationTargets).toEqual([]);
    expect(options.maxBreadcrumbs).toBe(0);
    expect(options.beforeSendTransaction()).toBeNull();
    expect(options.beforeSend).toBe(scrubEvent);
  });
});

describe("scrubEvent (allowlist)", () => {
  const event = {
    event_id: "abc",
    level: "error",
    platform: "node",
    environment: "production",
    server_name: "office-host.lan",
    request: { url: "https://office.example/api/office/login", headers: { cookie: "nodal_session=secret" }, data: "{\"password\":\"p\"}" },
    user: { id: "member-1", username: "alice", ip_address: "192.168.1.20" },
    breadcrumbs: [{ message: "room message: hello" }],
    extra: { body: "message text" },
    contexts: { os: { name: "Linux" } },
    tags: { room: "engineering" },
    message: "free text",
    exception: {
      values: [{
        type: "Error",
        value: "office_not_configured",
        mechanism: { type: "generic", handled: true, data: { token: "x" } },
        stacktrace: { frames: [{ filename: "src/office/service.ts", function: "say", lineno: 10, vars: { password: "p" }, context_line: "secret" }] },
      }],
    },
  };

  it("keeps only exception type, message and code location", () => {
    const scrubbed = scrubEvent(structuredClone(event)) as Record<string, unknown>;
    expect(Object.keys(scrubbed).filter((key) => scrubbed[key] !== undefined).sort())
      .toEqual(["environment", "event_id", "exception", "level", "platform"]);
    expect(scrubbed.exception).toEqual({
      values: [{
        type: "Error",
        value: "office_not_configured",
        mechanism: { type: "generic", handled: true },
        stacktrace: { frames: [{ filename: "src/office/service.ts", function: "say", lineno: 10,
          module: undefined, colno: undefined, in_app: undefined }] },
      }],
    });
  });

  it("never leaks request, cookies, user, messages or frame locals", () => {
    const serialized = JSON.stringify(scrubEvent(structuredClone(event)));
    for (const secret of ["nodal_session", "password", "alice", "192.168.1.20", "office-host", "hello", "message text", "free text", "secret"])
      expect(serialized).not.toContain(secret);
  });

  it("drops Drizzle query parameters (usernames, session digests) from exception messages", () => {
    const value = 'Failed query: select "id" from "office_members" where "username" = $1\nparams: alice,c2Vzc2lvbg';
    const scrubbed = scrubEvent({ exception: { values: [{ type: "Error", value }] } });
    expect(scrubbed.exception?.values?.[0]?.value).toBe('Failed query: select "id" from "office_members" where "username" = $1');
  });

  it("truncates long query messages", () => {
    const scrubbed = scrubEvent({ exception: { values: [{ type: "Error", value: `Failed query: select ${"x".repeat(1000)}` }] } });
    expect(scrubbed.exception?.values?.[0]?.value).toHaveLength(300);
  });

  const valueOf = (event: ReportableEvent, index = 0) => event.exception?.values?.[index]?.value;

  it("redacts free-text database messages, which quote user values", () => {
    for (const value of [
      'duplicate key value violates unique constraint "office_members_username_key"',
      'invalid input syntax for type uuid: "alice"',
      "connect ECONNREFUSED 10.0.0.5:5432",
      "database unavailable",
    ]) expect(valueOf(scrubEvent({ exception: { values: [{ type: "DatabaseError", value }] } }))).toBe("[redacted]");
  });

  it("keeps the app's own static error codes", () => {
    for (const value of ["office_not_configured", "workspace_not_initialized", "tenant_mismatch", "network_timeout"])
      expect(valueOf(scrubEvent({ exception: { values: [{ type: "Error", value }] } }))).toBe(value);
  });

  it("strips quoted literals from Drizzle query text", () => {
    const value = `Failed query: select "id" from "office_members" where "username" = 'alice' and "note" = 'it''s me'\nparams: alice`;
    expect(valueOf(scrubEvent({ exception: { values: [{ type: "Error", value }] } })))
      .toBe(`Failed query: select "id" from "office_members" where "username" = '?' and "note" = '?'`);
  });

  it("drops the values of linked cause errors but keeps their type", () => {
    const scrubbed = scrubEvent({ exception: { values: [
      { type: "DatabaseError", value: "office_not_configured", mechanism: { type: "chained", source: "cause", handled: true } as never },
      { type: "Error", value: "Failed query: select 1\nparams: " },
    ] } });
    expect(scrubbed.exception?.values?.[0]).toMatchObject({ type: "DatabaseError" });
    expect(valueOf(scrubbed, 0)).toBeUndefined();
    expect(valueOf(scrubbed, 1)).toBe("Failed query: select 1");
  });

  it("adds the Postgres SQLSTATE code from the original error chain, and nothing else from it", () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "x" Key (username)=(alice)'), { code: "23505", detail: "Key (username)=(alice)" });
    const error = new Error("Failed query: insert ...", { cause });
    const scrubbed = scrubEvent<ReportableEvent>({ exception: { values: [{ type: "Error", value: "Failed query: insert" }] } }, { originalException: error });
    expect(scrubbed.tags).toEqual({ pg_code: "23505" });
    expect(JSON.stringify(scrubbed)).not.toContain("alice");
    const notPg = scrubEvent<ReportableEvent>({ exception: { values: [] } }, { originalException: Object.assign(new Error("x"), { code: "alice" }) });
    expect(notPg.tags).toBeUndefined();
  });
});

describe("route failure reporting", () => {
  beforeEach(() => captureException.mockClear());

  it("reports unexpected errors that become a generic 503", async () => {
    const error = new Error("connection refused");
    const response = failure(error);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "office_unavailable" });
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("does not report expected client errors", () => {
    expect(failure(new OfficeError("unauthorized", 401)).status).toBe(401);
    const zod = Object.assign(new Error("bad"), { name: "ZodError" });
    expect(failure(zod).status).toBe(400);
    expect(captureException).not.toHaveBeenCalled();
  });
});
