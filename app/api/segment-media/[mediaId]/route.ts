import { dataResponse, errorResponse } from "@/lib/api-response";
import { updateMediaCard } from "@/lib/mock-store";
import type { MediaProvider } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  try {
    const { mediaId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    return dataResponse(
      updateMediaCard(mediaId, {
        prompt: typeof body.prompt === "string" ? body.prompt : undefined,
        generate_count: typeof body.generate_count === "number" ? body.generate_count : undefined,
        provider: typeof body.provider === "string" ? (body.provider as MediaProvider) : undefined,
        model: typeof body.model === "string" ? body.model : undefined,
        duration: typeof body.duration === "number" || body.duration === null ? body.duration : undefined,
        aspect_ratio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : undefined,
        resolution: typeof body.resolution === "string" ? body.resolution : undefined,
        audio: typeof body.audio === "boolean" || body.audio === null ? body.audio : undefined,
        reference_images_json: Array.isArray(body.reference_images_json) ? body.reference_images_json.filter((item): item is string => typeof item === "string").slice(0, 3) : undefined
      })
    );
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存卡片失败");
  }
}
