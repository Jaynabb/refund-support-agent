import { getConversations } from "@/lib/store/conversations";

// The growing conversation log — polled by the CRM panel to show it grow live.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ conversations: getConversations() });
}
