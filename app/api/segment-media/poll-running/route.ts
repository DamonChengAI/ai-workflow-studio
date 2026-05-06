import { dataResponse, errorResponse } from "@/lib/api-response";
import { pollRunningTasks } from "@/lib/workflow-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const limit = typeof body.limit === "number" ? body.limit : 50;
    return dataResponse(pollRunningTasks(limit));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "轮询失败");
  }
}
