"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";

export function ChatPanel({
  messages, busy, onSend,
}: {
  messages: ChatMessage[];
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const submit = () => { const t = input.trim(); if (!t) return; setInput(""); onSend(t); };

  return (
    <section className="flex min-h-0 flex-col border-r border-slate-200">
      <div className="border-b border-slate-200 px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        Customer chat
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-sm text-slate-400">
            Start a refund request, or talk to Ava with the live voice button.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed " +
              (m.role === "user"
                ? "rounded-br-sm bg-[#FF6900] text-white"
                : "rounded-bl-sm bg-slate-100 text-[#1D2333]")
            }>
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2.5 text-sm text-slate-400">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Type your message…"
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#1D2333] placeholder-slate-400 focus:border-[#FF6900] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-lg bg-[#FF6900] px-4 py-2 text-sm font-medium text-white hover:bg-[#E65F00] disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
