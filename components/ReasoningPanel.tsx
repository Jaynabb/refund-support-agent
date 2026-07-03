"use client";

import { useEffect, useRef } from "react";
import type { AgentEvent, PolicyRuleResult } from "@/lib/types";

const STYLE: Record<string, { dot: string; label: string; tint?: string }> = {
  user_message: { dot: "bg-slate-400", label: "Customer" },
  thinking: { dot: "bg-violet-500", label: "Reasoning" },
  tool_call: { dot: "bg-sky-500", label: "Tool call" },
  tool_result: { dot: "bg-emerald-500", label: "Tool result" },
  tool_error: { dot: "bg-rose-500", label: "Tool error", tint: "text-rose-600" },
  retry: { dot: "bg-amber-500", label: "Retry", tint: "text-amber-600" },
  policy_check: { dot: "bg-[#FF6900]", label: "Policy engine" },
  decision: { dot: "bg-[#1D2333]", label: "Decision" },
  agent_message: { dot: "bg-[#FF6900]", label: "Reply → customer" },
  error: { dot: "bg-rose-500", label: "Error", tint: "text-rose-600" },
};

const DECISION_BADGE: Record<string, string> = {
  approve: "bg-emerald-50 text-emerald-700 border-emerald-200",
  deny: "bg-rose-50 text-rose-700 border-rose-200",
};

export function ReasoningPanel({ events }: { events: AgentEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [events]);

  return (
    <section className="flex min-h-0 flex-col bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Agent reasoning · live</span>
        <span className="text-[11px] text-slate-400">{events.length} events</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 font-mono text-[13px]">
        {events.length === 0 && (
          <div className="mt-8 text-center text-slate-400">Agent steps stream here in real time.</div>
        )}
        <ol className="space-y-2.5">
          {events.map((e) => {
            const s = STYLE[e.type] ?? { dot: "bg-slate-500", label: e.type };
            return (
              <li key={e.id} className="flex gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{s.label}</span>
                  </div>
                  {e.type === "policy_check"
                    ? <PolicyCheck e={e} />
                    : e.type === "decision"
                    ? <DecisionBadge e={e} />
                    : <p className={`whitespace-pre-wrap break-words leading-snug ${s.tint ?? "text-slate-600"}`}>{e.label}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <div ref={endRef} />
      </div>
    </section>
  );
}

function DecisionBadge({ e }: { e: AgentEvent }) {
  const d = (e.data as { decision?: string })?.decision ?? "";
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${DECISION_BADGE[d] ?? "border-slate-300 text-slate-600"}`}>
      {e.label}
    </span>
  );
}

function PolicyCheck({ e }: { e: AgentEvent }) {
  const data = e.data as { decision: string; summary: string; eligibleAmount: number; rules: PolicyRuleResult[] };
  return (
    <div className="mt-1 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${DECISION_BADGE[data.decision] ?? "border-slate-300 text-slate-600"}`}>
          {data.decision.toUpperCase()}
        </span>
        <span className="text-xs text-slate-500">{data.summary}</span>
      </div>
      <ul className="space-y-1">
        {data.rules?.map((r) => (
          <li key={r.rule} className="flex gap-2 text-xs">
            <span className={r.passed ? "text-emerald-600" : "text-rose-600"}>{r.passed ? "✓" : "✗"}</span>
            <span className="text-slate-500"><span className="font-medium text-[#1D2333]">{r.rule}</span> — {r.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
