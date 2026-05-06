import { listResponse } from "@/lib/api-response";
import { listScenes } from "@/lib/mock-store";

export function GET(request: Request) {
  const url = new URL(request.url);
  return listResponse(listScenes(url.searchParams.get("idea_id")));
}
