// Next.js instrumentation hook. Only the Node.js server runtime reports errors;
// every NODAL route runs on Node.js and there is no browser or Edge Sentry SDK.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
