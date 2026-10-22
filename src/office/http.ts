import { cookies } from "next/headers";
import { OfficeError, OfficeService } from "./service";
import { officeDatabase } from "./database";
import { reportUnexpected } from "../observability/report";

export const COOKIE = "nodal_session";
export async function officeContext() {
  const service = new OfficeService(await officeDatabase());
  const token = (await cookies()).get(COOKIE)?.value;
  return { service, token, member: await service.authenticate(token) };
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.NODAL_APP_ORIGIN;
  const host = request.headers.get("host") ?? new URL(request.url).host;
  try {
    const parsed = new URL(origin ?? "");
    if ((expected ? parsed.origin === new URL(expected).origin : parsed.host === host) &&
      ["http:", "https:"].includes(parsed.protocol) && request.headers.get("sec-fetch-site") !== "cross-site") return;
  } catch { /* deny */ }
  throw new OfficeError("invalid_origin", 403);
}
// Bounded single-process pilot limiter. Replace with shared limits before horizontally scaling.
const limits = new Map<string, { count: number; expires: number }>();
export function rateLimit(key: string, maximum: number) {
  const now = Date.now();
  for (const [id, value] of limits) if (value.expires < now) limits.delete(id);
  const value = limits.get(key) ?? { count: 0, expires: now + 60000 };
  if (++value.count > maximum) throw new OfficeError("rate_limited", 429);
  limits.set(key, value);
}
export async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new OfficeError("invalid_request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); throw new OfficeError("request_too_large", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new OfficeError("invalid_request"); }
}
export function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export function failure(error: unknown) {
  if (error instanceof OfficeError) return reply({ error: error.message }, error.status);
  if (error instanceof Error && error.name === "ZodError") return reply({ error: "invalid_request" }, 400);
  reportUnexpected(error);
  return reply({ error: "office_unavailable" }, 503);
}
