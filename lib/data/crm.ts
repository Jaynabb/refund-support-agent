import type { Customer } from "@/lib/types";

// Delivery dates are relative to "now" so every scenario stays valid whenever the
// app is demoed (e.g. "delivered 5 days ago" is always inside the 30-day window).
const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// 15 profiles. Each order is crafted to hit a specific policy branch — see the
// SCENARIO note on each — so the demo covers clean approvals, hard denials
// (return window, final sale, digital, double-refund), and partial
// (mixed-eligibility) orders.
export const CUSTOMERS: Customer[] = [
  {
    // SCENARIO: clean approval — defective, in window, under cap.
    customerId: "C001", name: "Maria Alvarez", email: "maria.alvarez@example.com",
    loyaltyTier: "gold", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1001", customerId: "C001", placedAt: daysAgo(9), deliveredAt: daysAgo(5),
      total: 79.99, refunded: false, refundedAmount: 0, hasPhotoEvidence: true,
      items: [{ sku: "SKU-KTL-01", name: "Electric Kettle 1.7L", category: "standard", price: 79.99, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: DENY — outside the 30-day return window.
    customerId: "C002", name: "James Whitfield", email: "james.whitfield@example.com",
    loyaltyTier: "standard", refundsLast90Days: 1,
    orders: [{
      orderId: "ORD-1002", customerId: "C002", placedAt: daysAgo(52), deliveredAt: daysAgo(45),
      total: 119.0, refunded: false, refundedAmount: 0, hasPhotoEvidence: false,
      items: [{ sku: "SKU-HDP-02", name: "Wireless Headphones", category: "standard", price: 119.0, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: DENY — final-sale item, non-refundable.
    customerId: "C003", name: "Priya Nair", email: "priya.nair@example.com",
    loyaltyTier: "standard", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1003", customerId: "C003", placedAt: daysAgo(6), deliveredAt: daysAgo(3),
      total: 59.5, refunded: false, refundedAmount: 0, hasPhotoEvidence: false,
      items: [{ sku: "SKU-TEE-03", name: "Clearance Graphic Tee", category: "final_sale", price: 59.5, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: DENY — digital goods, non-refundable once delivered.
    customerId: "C004", name: "Daniel Osei", email: "daniel.osei@example.com",
    loyaltyTier: "standard", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1004", customerId: "C004", placedAt: daysAgo(2), deliveredAt: daysAgo(2),
      total: 39.99, refunded: false, refundedAmount: 0, hasPhotoEvidence: false,
      items: [{ sku: "SKU-EBK-04", name: "Photography Masterclass (eBook)", category: "digital", price: 39.99, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: DENY — order already refunded, no double refunds.
    customerId: "C005", name: "Sofia Rossi", email: "sofia.rossi@example.com",
    loyaltyTier: "gold", refundsLast90Days: 1,
    orders: [{
      orderId: "ORD-1005", customerId: "C005", placedAt: daysAgo(14), deliveredAt: daysAgo(10),
      total: 89.0, refunded: true, refundedAmount: 89.0, hasPhotoEvidence: true,
      items: [{ sku: "SKU-BLN-05", name: "Weighted Blanket", category: "standard", price: 89.0, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: ESCALATE — amount over the $500 auto-approve cap.
    customerId: "C006", name: "Henry Okafor", email: "henry.okafor@example.com",
    loyaltyTier: "platinum", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1006", customerId: "C006", placedAt: daysAgo(11), deliveredAt: daysAgo(7),
      total: 749.0, refunded: false, refundedAmount: 0, hasPhotoEvidence: true,
      items: [{ sku: "SKU-LTP-06", name: "Ultrabook Laptop 14\"", category: "standard", price: 749.0, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: ESCALATE — customer flagged (>3 refunds in 90 days).
    customerId: "C007", name: "Chloe Bennett", email: "chloe.bennett@example.com",
    loyaltyTier: "standard", refundsLast90Days: 4,
    orders: [{
      orderId: "ORD-1007", customerId: "C007", placedAt: daysAgo(8), deliveredAt: daysAgo(5),
      total: 69.99, refunded: false, refundedAmount: 0, hasPhotoEvidence: true,
      items: [{ sku: "SKU-SPK-07", name: "Bluetooth Speaker", category: "standard", price: 69.99, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: APPROVE — changed mind within 14 days, unopened standard item.
    customerId: "C008", name: "Liam Foster", email: "liam.foster@example.com",
    loyaltyTier: "standard", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1008", customerId: "C008", placedAt: daysAgo(11), deliveredAt: daysAgo(8),
      total: 49.95, refunded: false, refundedAmount: 0, hasPhotoEvidence: false,
      items: [{ sku: "SKU-MUG-08", name: "Ceramic Mug Set (4)", category: "standard", price: 49.95, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: DENY — changed mind after the 14-day changed-mind window.
    customerId: "C009", name: "Amara Diallo", email: "amara.diallo@example.com",
    loyaltyTier: "standard", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1009", customerId: "C009", placedAt: daysAgo(24), deliveredAt: daysAgo(20),
      total: 54.0, refunded: false, refundedAmount: 0, hasPhotoEvidence: false,
      items: [{ sku: "SKU-LMP-09", name: "Desk Lamp", category: "standard", price: 54.0, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: evidence rule — damage over $100 but NO photo → request evidence, don't approve yet.
    customerId: "C010", name: "Noah Kim", email: "noah.kim@example.com",
    loyaltyTier: "standard", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1010", customerId: "C010", placedAt: daysAgo(10), deliveredAt: daysAgo(6),
      total: 249.0, refunded: false, refundedAmount: 0, hasPhotoEvidence: false,
      items: [{ sku: "SKU-MNT-10", name: "27\" Monitor", category: "standard", price: 249.0, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: APPROVE — damage over $100 WITH photo evidence present.
    customerId: "C011", name: "Emma Schmidt", email: "emma.schmidt@example.com",
    loyaltyTier: "gold", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1011", customerId: "C011", placedAt: daysAgo(9), deliveredAt: daysAgo(6),
      total: 299.0, refunded: false, refundedAmount: 0, hasPhotoEvidence: true,
      items: [{ sku: "SKU-CHR-11", name: "Ergonomic Office Chair", category: "standard", price: 299.0, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: DENY — order placed but not yet delivered.
    customerId: "C012", name: "Lucas Moreau", email: "lucas.moreau@example.com",
    loyaltyTier: "standard", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1012", customerId: "C012", placedAt: daysAgo(2), deliveredAt: null,
      total: 132.0, refunded: false, refundedAmount: 0, hasPhotoEvidence: false,
      items: [{ sku: "SKU-BAG-12", name: "Travel Backpack", category: "standard", price: 132.0, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: DENY — opened personal-care item, non-refundable for hygiene.
    customerId: "C013", name: "Isabella Costa", email: "isabella.costa@example.com",
    loyaltyTier: "standard", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1013", customerId: "C013", placedAt: daysAgo(5), deliveredAt: daysAgo(2),
      total: 34.5, refunded: false, refundedAmount: 0, hasPhotoEvidence: false,
      items: [{ sku: "SKU-RZR-13", name: "Electric Razor", category: "standard", price: 34.5, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: APPROVE — wrong item shipped, in window, with photo, gold tier.
    customerId: "C014", name: "Oliver Grant", email: "oliver.grant@example.com",
    loyaltyTier: "gold", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1014", customerId: "C014", placedAt: daysAgo(7), deliveredAt: daysAgo(4),
      total: 149.0, refunded: false, refundedAmount: 0, hasPhotoEvidence: true,
      items: [{ sku: "SKU-WCH-14", name: "Smart Watch", category: "standard", price: 149.0, quantity: 1 }],
    }],
  },
  {
    // SCENARIO: PARTIAL — mixed order: standard item refundable, final-sale line not.
    customerId: "C015", name: "Grace Thompson", email: "grace.thompson@example.com",
    loyaltyTier: "standard", refundsLast90Days: 0,
    orders: [{
      orderId: "ORD-1015", customerId: "C015", placedAt: daysAgo(8), deliveredAt: daysAgo(5),
      total: 99.5, refunded: false, refundedAmount: 0, hasPhotoEvidence: true,
      items: [
        { sku: "SKU-PAN-15", name: "Non-stick Frying Pan", category: "standard", price: 59.5, quantity: 1 },
        { sku: "SKU-SOCK-15", name: "Clearance Wool Socks", category: "final_sale", price: 40.0, quantity: 1 },
      ],
    }],
  },
];

// Simple indexed lookups used by the tools.
export function findCustomerByEmail(email: string): Customer | undefined {
  const e = email.trim().toLowerCase();
  return CUSTOMERS.find((c) => c.email.toLowerCase() === e);
}

export function findCustomerById(customerId: string): Customer | undefined {
  const id = customerId.trim().toUpperCase();
  return CUSTOMERS.find((c) => c.customerId.toUpperCase() === id);
}

// Match on full name or first name (case-insensitive). Returns all matches so the
// tool can disambiguate if a name is shared.
export function findCustomersByName(name: string): Customer[] {
  const q = name.trim().toLowerCase();
  if (!q) return [];
  return CUSTOMERS.filter((c) => {
    const full = c.name.toLowerCase();
    return full === q || full.split(" ")[0] === q || full.includes(q);
  });
}

export function findOrder(orderId: string): { customer: Customer; order: Customer["orders"][number] } | undefined {
  const id = orderId.trim().toUpperCase();
  for (const customer of CUSTOMERS) {
    const order = customer.orders.find((o) => o.orderId.toUpperCase() === id);
    if (order) return { customer, order };
  }
  return undefined;
}
