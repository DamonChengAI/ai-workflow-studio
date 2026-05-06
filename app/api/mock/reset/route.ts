import { dataResponse } from "@/lib/api-response";
import { resetStore } from "@/lib/mock-store";

export function POST() {
  resetStore();
  return dataResponse({ reset: true });
}
