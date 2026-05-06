import { dataResponse, errorResponse } from "@/lib/api-response";
import { submitMedia } from "@/lib/workflow-service";

export async function POST(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  try {
    const { mediaId } = await params;
    const result = submitMedia(mediaId);
    return dataResponse({ media: result.media, tasks: result.tasks, created: result.created, message: result.message });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "提交生成失败");
  }
}
