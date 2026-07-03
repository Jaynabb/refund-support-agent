import { CUSTOMERS } from "@/lib/data/crm";
import { getConversations } from "@/lib/store/conversations";

// The living CRM: the 15 seed accounts + the growing conversation log.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const customers = CUSTOMERS.map((c) => ({
    customerId: c.customerId,
    name: c.name,
    email: c.email,
    loyaltyTier: c.loyaltyTier,
    refundsLast90Days: c.refundsLast90Days,
    orders: c.orders.map((o) => ({
      orderId: o.orderId,
      total: o.total,
      deliveredAt: o.deliveredAt,
      items: o.items.map((i) => i.name).join(", "),
    })),
  }));
  return Response.json({ customers, conversations: getConversations() });
}
