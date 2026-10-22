import { engineeringContext } from "@/src/office/engineering";
import { OfficeError } from "@/src/office/service";
import { reportUnexpected } from "@/src/observability/report";
import { handleApproval } from "@/src/server/approval";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { repository, principal } = await engineeringContext();
    return await handleApproval(request, repository, principal);
  } catch (error) {
    if (error instanceof OfficeError) return Response.json({ error: error.message, externalWrite: "disabled" }, { status: error.status });
    reportUnexpected(error);
    return Response.json({ error: "workspace_unavailable", externalWrite: "disabled" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
