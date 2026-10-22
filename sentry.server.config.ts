import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/src/observability/sentry";

Sentry.init(sentryOptions(process.env.SENTRY_DSN));
