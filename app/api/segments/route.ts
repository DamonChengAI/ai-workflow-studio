import { listResponse } from "@/lib/api-response";
import { listSegments } from "@/lib/mock-store";

export function GET(request: Request) {
  const url = new URL(request.url);
  return listResponse(listSegments(url.searchParams.get("scene_id")));
}
