import { CUSTOMERS } from "@/lib/data/crm";
import { getConversations } from "@/lib/store/conversations";

// The living CRM: the 15 seed accounts + the growing conversation log.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const customers = CUSTOMERS.map((c) => ({
    customerId: c.customerId,
    name: c.name,
    loyaltyTier: c.loyaltyTier,
    refundsLast90Days: c.refundsLast90Days,
    orders: c.orders.map((o) => ({
      orderId: o.orderId,
      total: o.total,
      deliveredAt: o.deliveredAt,
      refunded: o.refunded,
      items: o.items.map((i) => ({ name: i.name, category: i.category })),
    })),
  }));
  return Response.json({ customers, conversations: getConversations() });
}
