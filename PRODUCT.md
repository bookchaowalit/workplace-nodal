# Product Brief — Organization Environment

## Positioning

One live environment where engineering teams and AI agents turn shared context
into verified execution.

The spatial world is an interface, not the product boundary.

## First user

Small engineering/AI teams that currently split work across meetings, GitHub,
Linear/Jira, documents, chat, and observability tools.

## Job to be done

After a team makes a decision, preserve why it was made, turn it into owned
work, and make the path to verification visible without asking someone to
manually re-enter the same context in several tools.

## Demo promise

Given one engineering meeting context, the system can show a decision, propose
owned tasks and dependencies, require human approval, and render the result in
standard, spatial, and graph interfaces.

## Production promise — not yet claimed

The hosted product will ingest approved integrations, maintain an auditable
organization graph, and execute only policy-allowed actions through durable
workflows. This local fixture does not prove that promise.

## V1 success metrics

- 8 of 10 clear decisions produce accepted task proposals with owners and
  dependencies in under three minutes.
- 100% of external writes have an explicit approval event and idempotency key.
- 100% of displayed decisions link back to a source meeting or artifact.
- A user can understand the current engineering state from the room in under
  one minute.

## In scope

- one Engineering Room;
- human and AI actors in one graph;
- GitHub + Linear adapters after the fixture slice;
- meeting → decision → task → verification contract;
- standard, spatial, and graph projections;
- cited organizational memory after the canonical event model exists.

## Out of scope for V1

- general-purpose virtual office;
- autonomous merge, deploy, or incident remediation;
- AR/VR, robotics, and mobile-native clients;
- a new calendar, chat, or project-management system;
- production billing, enterprise SSO, or transcript retention claims.


## Operations today

- Runs only where someone starts it: loopback (`pnpm office:dev`), same-LAN
  (`pnpm office:lan`) or a self-hosted `pnpm start`. There is no hosted
  deployment and no live URL.
- Server-side error reporting to Sentry is wired but inert unless the operator
  sets `SENTRY_DSN`; see README "Error reporting" for what is and is not sent.
