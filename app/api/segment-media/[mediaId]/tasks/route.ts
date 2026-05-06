import { listResponse } from "@/lib/api-response";
import { listTasks } from "@/lib/mock-store";

export async function GET(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const { mediaId } = await params;
  return listResponse(listTasks(mediaId));
}
