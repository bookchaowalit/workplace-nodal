import { captureException } from "@sentry/nextjs";

// Routes convert unexpected failures into a generic 503 so nothing internal reaches the
// browser; without this the cause would vanish. captureException is a no-op until
// sentry.server.config.ts initialises Sentry with SENTRY_DSN.
export function reportUnexpected(error: unknown) {
  captureException(error);
}
