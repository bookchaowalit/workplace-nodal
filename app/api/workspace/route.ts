import { NextResponse } from "next/server";

import { engineeringContext } from "@/src/office/engineering";
import { OfficeError } from "@/src/office/service";
import { reportUnexpected } from "@/src/observability/report";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { repository, canApprove, authenticated } = await engineeringContext();
    const room = await repository.room();
    if (authenticated) room.approvalAvailable = Boolean(canApprove);
    return NextResponse.json(room, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OfficeError) return NextResponse.json({ error: error.message, externalWrite: "disabled" }, { status: error.status });
    reportUnexpected(error);
    return NextResponse.json({ error: "workspace_unavailable", mode: "connected-read-only",
      externalWrite: "disabled" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
