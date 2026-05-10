import { dataResponse, errorResponse } from "@/lib/api-response";
import { listAudioTasks } from "@/lib/mock-store";
import { submitSegmentAudio } from "@/lib/workflow-service";

export async function GET(_request: Request, { params }: { params: Promise<{ segmentId: string }> }) {
  try {
    const { segmentId } = await params;
    return dataResponse({ items: listAudioTasks(segmentId) }, { total: listAudioTasks(segmentId).length });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "加载音频任务失败");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ segmentId: string }> }) {
  try {
    const { segmentId } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sourceText = typeof body.source_text === "string" ? body.source_text : undefined;
    return dataResponse(submitSegmentAudio(segmentId, sourceText));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "提交音频任务失败");
  }
}
