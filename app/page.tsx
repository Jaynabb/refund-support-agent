"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider } from "@elevenlabs/react";
import type { AgentEvent, ChatMessage } from "@/lib/types";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { CrmPanel } from "@/components/CrmPanel";
import { PolicyDoc } from "@/components/PolicyDoc";

type Tab = "conversation" | "crm" | "policy";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("conversation");
  const [crmCount, setCrmCount] = useState(15);
  const busyRef = useRef(false);
  const convIdRef = useRef<string>("");
  if (!convIdRef.current) convIdRef.current = `conv_${Date.now()}_${Math.round(Math.random() * 1e4)}`;

  const onVoiceMessage = useCallback((m: { source?: string; message?: string }) => {
    if (!m?.message) return;
    setMessages((prev) => [...prev, { role: m.source === "user" ? "user" : "assistant", content: m.message! }]);
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, conversationId: convIdRef.current }),
      });
      if (!res.body) throw new Error("No response stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let evt: AgentEvent;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }
          if (!evt?.type) continue;
          setEvents((prev) => [...prev, evt]);
          if (evt.type === "agent_message") setMessages((prev) => [...prev, { role: "assistant", content: evt.label }]);
        }
      }
    } catch (err) {
      setEvents((prev) => [...prev, { id: `err_${Date.now()}`, seq: -1, ts: Date.now(), type: "error", label: err instanceof Error ? err.message : "Request failed" }]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [messages]);

  // Live feed from phone/voice server tools. Always subscribed, so simply calling
  // the support number connects to the platform and drives the reasoning panel +
  // conversation tracking in real time — no button required.
  useEffect(() => {
    const es = new EventSource("/api/live");
    es.onmessage = (m) => {
      try { const evt = JSON.parse(m.data) as AgentEvent; if (evt?.type) setEvents((prev) => [...prev, evt]); } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  // CRM tab badge = number of accounts only (the 15 seed customers). Stored
  // conversations are shown separately in the panel, so they never inflate this.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/crm", { cache: "no-store" });
        const d = await r.json();
        if (alive) setCrmCount(d.customers?.length ?? 15);
      } catch { /* keep last */ }
    };
    load();
    const iv = setInterval(load, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const reset = () => {
    setMessages([]); setEvents([]);
    convIdRef.current = `conv_${Date.now()}_${Math.round(Math.random() * 1e4)}`;
  };

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "conversation", label: "Conversation" },
    { id: "crm", label: "CRM", badge: crmCount },
    { id: "policy", label: "Policy" },
  ];

  return (
    <ConversationProvider onMessage={onVoiceMessage}>
      <div className="flex h-dvh flex-col bg-white text-[#1D2333]">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#FF6900] font-bold text-white">A</div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Ava — AI Refund Support</h1>
              <p className="text-xs text-slate-500 leading-tight">Acme Store · policy-grounded refund agent</p>
            </div>
          </div>
          <button onClick={reset} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
            New conversation
          </button>
        </header>

        <nav className="flex items-center gap-1 border-b border-slate-200 px-4">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={"relative px-4 py-2.5 text-sm font-medium transition-colors " +
                (tab === t.id ? "text-[#FF6900]" : "text-slate-500 hover:text-[#1D2333]")}>
              {t.label}
              {t.badge != null && (
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{t.badge}</span>
              )}
              {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-[#FF6900]" />}
            </button>
          ))}
        </nav>

        <div className="flex min-h-0 flex-1 flex-col">
          {tab === "conversation" && (
            <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <ChatPanel messages={messages} busy={busy} onSend={send} />
              <ReasoningPanel events={events} />
            </main>
          )}
          {tab === "crm" && <CrmPanel />}
          {tab === "policy" && <PolicyDoc />}
        </div>
      </div>
    </ConversationProvider>
  );
}
