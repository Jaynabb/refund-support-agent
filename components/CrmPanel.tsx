"use client";

import { useEffect, useState } from "react";

interface OrderRow {
  orderId: string; total: number; deliveredAt: string | null; refunded: boolean;
  items: { name: string; category: string }[];
}
interface Customer {
  customerId: string; name: string; loyaltyTier: string; refundsLast90Days: number; orders: OrderRow[];
}
interface Conversation {
  id: string; channel: "text" | "voice"; customerName: string; orderId?: string;
  reason?: string; decision?: string; amount?: number; createdAt: number;
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const CAT_LABEL: Record<string, string> = { final_sale: "Final sale", digital: "Digital", standard: "Standard" };

const DEC_TXT: Record<string, string> = {
  approve: "text-emerald-600", deny: "text-rose-600", pending: "text-slate-400",
};
const ago = (ts: number) => { const s = Math.floor((Date.now() - ts) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };

export function CrmPanel() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/crm", { cache: "no-store" });
        const d = await r.json();
        if (alive) { setCustomers(d.customers ?? []); setConversations(d.conversations ?? []); }
      } catch { /* keep last */ }
    };
    load();
    const iv = setInterval(load, 2000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const rows = customers.flatMap((c) => c.orders.map((o) => ({ c, o })));

  return (
    <section className="flex min-h-0 flex-col bg-white">
      {/* Orders measured against policy */}
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Customers &amp; orders</span>
        <span className="text-[11px] text-slate-400">{customers.length} customers · {rows.length} orders</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_#e2e8f0]">
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
              <th className="px-6 py-2 font-medium">Customer</th>
              <th className="px-2 py-2 font-medium">Order</th>
              <th className="px-2 py-2 font-medium">Item</th>
              <th className="px-2 py-2 font-medium">Type</th>
              <th className="px-2 py-2 text-right font-medium">Amount</th>
              <th className="px-6 py-2 font-medium">Delivered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, o }) => {
              const d = o.deliveredAt ? daysSince(o.deliveredAt) : null;
              const outWindow = d !== null && d > 30;
              const cats = [...new Set(o.items.map((i) => i.category))];
              return (
                <tr key={o.orderId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-1.5">
                    <span className="font-medium text-[#1D2333]">{c.name}</span>
                  </td>
                  <td className="px-2 py-1.5 text-slate-500">{o.orderId}</td>
                  <td className="px-2 py-1.5 text-slate-600">{o.items.map((i) => i.name).join(", ")}</td>
                  <td className="px-2 py-1.5">
                    {cats.map((cat) => (
                      <span key={cat} className={"mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium " +
                        (cat === "standard" ? "text-slate-400" : "border border-rose-200 bg-rose-50 text-rose-700")}>{CAT_LABEL[cat]}</span>
                    ))}
                  </td>
                  <td className={"px-2 py-1.5 text-right tabular-nums " + (o.total > 500 ? "font-semibold text-amber-600" : "text-slate-600")}>
                    ${o.total.toFixed(2)}
                    {o.refunded && <span className="ml-1 rounded border border-slate-200 bg-slate-50 px-1 text-[9px] uppercase text-slate-400">refunded</span>}
                  </td>
                  <td className={"px-6 py-1.5 " + (o.deliveredAt === null || outWindow ? "text-rose-600" : "text-slate-500")}>
                    {o.deliveredAt === null ? "Not delivered" : `${d}d ago`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Live conversation log (every text/voice/phone interaction is stored) */}
      <div className="max-h-40 shrink-0 overflow-y-auto border-t border-slate-200">
        <div className="sticky top-0 flex items-center justify-between bg-slate-50 px-6 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Conversations · live</span>
          <span className="text-[10px] text-slate-400">{conversations.length} logged</span>
        </div>
        {conversations.length === 0 ? (
          <div className="px-6 py-3 text-xs text-slate-400">Chat or call in — every interaction is logged here in real time.</div>
        ) : (
          <ul className="px-6 py-1">
            {conversations.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-1 text-xs">
                <span>{c.channel === "voice" ? "📞" : "💬"}</span>
                <span className="font-medium text-[#1D2333]">{c.customerName}</span>
                <span className="text-slate-500">{c.orderId}{c.reason ? ` · ${c.reason}` : ""}</span>
                <span className={"font-semibold " + (DEC_TXT[c.decision ?? "pending"] ?? "text-slate-400")}>
                  {(c.decision ?? "pending") === "pending" ? "In progress" : (c.decision![0].toUpperCase() + c.decision!.slice(1))}
                  {c.amount ? ` $${c.amount.toFixed(2)}` : ""}
                </span>
                <span className="ml-auto text-slate-400">{ago(c.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
