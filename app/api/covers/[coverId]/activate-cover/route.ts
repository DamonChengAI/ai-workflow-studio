import { dataResponse, errorResponse } from "@/lib/api-response";
import { activateCoverImage } from "@/lib/mock-store";

export async function POST(_request: Request, { params }: { params: Promise<{ coverId: string }> }) {
  try {
    const { coverId } = await params;
    return dataResponse(activateCoverImage(coverId));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "切换封面失败");
  }
}
