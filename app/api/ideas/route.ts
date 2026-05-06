import { listResponse } from "@/lib/api-response";
import { listIdeas } from "@/lib/mock-store";

export function GET() {
  return listResponse(listIdeas());
}
