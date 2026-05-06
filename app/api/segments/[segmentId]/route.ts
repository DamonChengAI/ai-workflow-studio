import { dataResponse, errorResponse } from "@/lib/api-response";
import { updateSegment } from "@/lib/mock-store";

export async function PATCH(request: Request, { params }: { params: Promise<{ segmentId: string }> }) {
  try {
    const { segmentId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    return dataResponse(
      updateSegment(segmentId, {
        narration: typeof body.narration === "string" ? body.narration : undefined,
        narration_cn: typeof body.narration_cn === "string" ? body.narration_cn : undefined
      })
    );
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存 Segment 失败");
  }
}
