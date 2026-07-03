"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider } from "@elevenlabs/react";
import type { AgentEvent, ChatMessage } from "@/lib/types";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { PolicyRules } from "@/components/PolicyRules";
import { CrmPanel } from "@/components/CrmPanel";
import { VoiceCall } from "@/components/VoiceCall";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const busyRef = useRef(false);
  const convIdRef = useRef<string>("");
  if (!convIdRef.current) convIdRef.current = `conv_${Date.now()}_${Math.round(Math.random() * 1e4)}`;

  // Real-time voice transcripts (from the ElevenLabs SDK) flow into the chat.
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

  // Live feed from voice/phone server tools — the panel + CRM update in real time.
  useEffect(() => {
    const es = new EventSource("/api/live");
    es.onopen = () => setPhoneConnected(true);
    es.onmessage = (m) => {
      try { const evt = JSON.parse(m.data) as AgentEvent; if (evt?.type) setEvents((prev) => [...prev, evt]); } catch { /* ignore */ }
    };
    es.onerror = () => setPhoneConnected(false);
    return () => es.close();
  }, []);

  const reset = () => {
    setMessages([]); setEvents([]);
    convIdRef.current = `conv_${Date.now()}_${Math.round(Math.random() * 1e4)}`;
  };

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
          <div className="flex items-center gap-2">
            <span className={"flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs " +
              (phoneConnected ? "border-emerald-500/50 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-400")}>
              <span className={"h-1.5 w-1.5 rounded-full " + (phoneConnected ? "bg-emerald-500" : "bg-slate-300")} />
              📞 Live
            </span>
            <VoiceCall />
            <button onClick={reset} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
              New conversation
            </button>
          </div>
        </header>

        <PolicyRules />

        <div className="flex min-h-0 flex-1 flex-col">
          <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <ChatPanel messages={messages} busy={busy} onSend={send} />
            <ReasoningPanel events={events} />
          </main>
          <div className="h-56 shrink-0">
            <CrmPanel />
          </div>
        </div>
      </div>
    </ConversationProvider>
  );
}
