import { listResponse } from "@/lib/api-response";
import { listMediaCards } from "@/lib/mock-store";

export function GET(request: Request) {
  const url = new URL(request.url);
  return listResponse(listMediaCards(url.searchParams.get("segment_id")));
}
