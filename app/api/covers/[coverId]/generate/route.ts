import { dataResponse, errorResponse } from "@/lib/api-response";
import { generateCoverImage } from "@/lib/mock-store";

export async function POST(_request: Request, { params }: { params: Promise<{ coverId: string }> }) {
  try {
    const { coverId } = await params;
    return dataResponse(generateCoverImage(coverId));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "生成封面失败");
  }
}
