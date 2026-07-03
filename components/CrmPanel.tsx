"use client";

import { useEffect, useState } from "react";

interface Customer {
  customerId: string; name: string; loyaltyTier: string; refundsLast90Days: number;
  orders: { orderId: string; total: number; deliveredAt: string | null; items: string }[];
}
interface Conversation {
  id: string; channel: "text" | "voice"; customerName: string; orderId?: string;
  reason?: string; decision?: string; amount?: number; createdAt: number;
}

const DECISION: Record<string, string> = {
  approve: "text-emerald-600", deny: "text-rose-600", escalate: "text-amber-600", pending: "text-slate-400",
};

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

  const total = customers.length + conversations.length;

  return (
    <section className="flex min-h-0 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          CRM · <span className="text-[#1D2333]">{total}</span> records
        </span>
        <span className="text-[11px] text-slate-400">{customers.length} accounts + {conversations.length} conversations</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* 15 seed accounts */}
        <div className="min-h-0 overflow-y-auto border-r border-slate-200 px-4 py-2">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Accounts ({customers.length})</div>
          <table className="w-full text-xs">
            <tbody>
              {customers.map((c) => (
                <tr key={c.customerId} className="border-b border-slate-100">
                  <td className="py-1 pr-2 font-medium text-[#1D2333]">{c.name}</td>
                  <td className="py-1 pr-2 text-slate-500">{c.orders.map((o) => o.orderId).join(", ")}</td>
                  <td className="py-1 text-right text-slate-500">{c.refundsLast90Days > 3 ? <span className="text-amber-600">⚑ {c.refundsLast90Days} refunds</span> : `${c.loyaltyTier}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* live-growing conversation log */}
        <div className="min-h-0 overflow-y-auto px-4 py-2">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Conversations · live</div>
          {conversations.length === 0 && <div className="mt-3 text-xs text-slate-400">Chat or call in — records appear here in real time.</div>}
          <table className="w-full text-xs">
            <tbody>
              {conversations.map((c) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="py-1 pr-2">{c.channel === "voice" ? "📞" : "💬"}</td>
                  <td className="py-1 pr-2 font-medium text-[#1D2333]">{c.customerName}</td>
                  <td className="py-1 pr-2 text-slate-500">{c.orderId}{c.reason ? ` · ${c.reason}` : ""}</td>
                  <td className={`py-1 text-right font-semibold ${DECISION[c.decision ?? "pending"] ?? "text-slate-400"}`}>
                    {(c.decision ?? "pending").toUpperCase()}{c.amount ? ` $${c.amount.toFixed(2)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
