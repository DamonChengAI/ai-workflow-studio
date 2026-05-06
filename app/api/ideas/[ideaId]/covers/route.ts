import { listResponse } from "@/lib/api-response";
import { listCovers } from "@/lib/mock-store";

export function GET(_request: Request, { params }: { params: Promise<{ ideaId: string }> }) {
  return params.then(({ ideaId }) => listResponse(listCovers(ideaId)));
}
