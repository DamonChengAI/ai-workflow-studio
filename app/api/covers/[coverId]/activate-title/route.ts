import { dataResponse, errorResponse } from "@/lib/api-response";
import { activateTitle } from "@/lib/mock-store";

export async function POST(_request: Request, { params }: { params: Promise<{ coverId: string }> }) {
  try {
    const { coverId } = await params;
    return dataResponse(activateTitle(coverId));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "切换标题失败");
  }
}
