import { dataResponse, errorResponse } from "@/lib/api-response";
import { getSettings, updateSettings } from "@/lib/mock-store";

export function GET() {
  return dataResponse(getSettings());
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return dataResponse(
      updateSettings({
        output_base_dir: typeof body.output_base_dir === "string" ? body.output_base_dir : undefined,
        auto_poll_enabled: typeof body.auto_poll_enabled === "boolean" ? body.auto_poll_enabled : undefined,
        auto_poll_interval_ms: typeof body.auto_poll_interval_ms === "number" ? body.auto_poll_interval_ms : undefined
      })
    );
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "保存设置失败");
  }
}
