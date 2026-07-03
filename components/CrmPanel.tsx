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

const STATUS: Record<string, { label: string; cls: string }> = {
  approve: { label: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  deny: { label: "Denied", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  escalate: { label: "Escalated", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pending: { label: "In progress", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

function Badge({ decision }: { decision?: string }) {
  const s = STATUS[decision ?? "pending"] ?? STATUS.pending;
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>{s.label}</span>;
}

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

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
  const count = (d: string) => conversations.filter((c) => c.decision === d).length;

  return (
    <section className="flex min-h-0 flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-6 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          CRM · <span className="text-[#1D2333]">{total}</span> records
        </span>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{customers.length} accounts</span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">{count("approve")} approved</span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">{count("deny")} denied</span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">{count("escalate")} escalated</span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* Accounts */}
        <div className="min-h-0 overflow-y-auto border-r border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-1.5 font-medium">Customer</th>
                <th className="px-2 py-1.5 font-medium">Orders</th>
                <th className="px-4 py-1.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.customerId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-1.5 font-medium text-[#1D2333]">{c.name}</td>
                  <td className="px-2 py-1.5 text-slate-500">{c.orders.map((o) => o.orderId).join(", ")}</td>
                  <td className="px-4 py-1.5 text-right">
                    {c.refundsLast90Days > 3
                      ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">⚑ Flagged · {c.refundsLast90Days} refunds</span>
                      : <span className="capitalize text-slate-400">{c.loyaltyTier}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Conversations (live) */}
        <div className="min-h-0 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="mt-6 text-center text-xs text-slate-400">Chat or call in — records appear here in real time.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-1.5 font-medium">Customer</th>
                  <th className="px-2 py-1.5 font-medium">Request</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-4 py-1.5 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-1.5">
                      <span className="mr-1">{c.channel === "voice" ? "📞" : "💬"}</span>
                      <span className="font-medium text-[#1D2333]">{c.customerName}</span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">{c.orderId}{c.reason ? ` · ${c.reason}` : ""}{c.amount ? ` · $${c.amount.toFixed(2)}` : ""}</td>
                    <td className="px-2 py-1.5"><Badge decision={c.decision} /></td>
                    <td className="px-4 py-1.5 text-right text-slate-400">{ago(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
