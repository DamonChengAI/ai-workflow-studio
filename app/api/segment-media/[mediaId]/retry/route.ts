import { dataResponse, errorResponse } from "@/lib/api-response";
import { retryMedia } from "@/lib/workflow-service";

export async function POST(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  try {
    const { mediaId } = await params;
    const result = retryMedia(mediaId);
    return dataResponse({ media: result.media, tasks: result.tasks, retried: result.retried, message: result.message });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "重试失败");
  }
}
