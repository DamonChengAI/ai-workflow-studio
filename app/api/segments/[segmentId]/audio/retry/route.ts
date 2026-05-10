import { dataResponse, errorResponse } from "@/lib/api-response";
import { retrySegmentAudio } from "@/lib/workflow-service";

export async function POST(request: Request, { params }: { params: Promise<{ segmentId: string }> }) {
  try {
    const { segmentId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sourceText = typeof body.source_text === "string" ? body.source_text : undefined;
    return dataResponse(retrySegmentAudio(segmentId, sourceText));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "重试音频任务失败");
  }
}
