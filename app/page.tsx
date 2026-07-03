"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, ChatMessage } from "@/lib/types";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { PolicyRules } from "@/components/PolicyRules";
import { CrmPanel } from "@/components/CrmPanel";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const busyRef = useRef(false);
  const voiceRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const convIdRef = useRef<string>("");
  if (!convIdRef.current) convIdRef.current = `conv_${Date.now()}_${Math.round(Math.random() * 1e4)}`;

  const speak = useCallback(async (text: string) => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play().catch(() => {});
    } catch { /* ignore playback errors */ }
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
          const payload = line.slice(6);
          let evt: AgentEvent;
          try { evt = JSON.parse(payload); } catch { continue; }
          if (!evt?.type) continue;
          setEvents((prev) => [...prev, evt]);
          if (evt.type === "agent_message") {
            setMessages((prev) => [...prev, { role: "assistant", content: evt.label }]);
            if (voiceRef.current) speak(evt.label);
          }
        }
      }
    } catch (err) {
      setEvents((prev) => [...prev, {
        id: `err_${Date.now()}`, seq: -1, ts: Date.now(), type: "error",
        label: err instanceof Error ? err.message : "Request failed",
      }]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [messages, speak]);

  // Live feed from phone-call server tools — the on-screen panel updates in real
  // time while you're on the phone with Ava.
  const [phoneConnected, setPhoneConnected] = useState(false);
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
    setMessages([]); setEvents([]); audioRef.current?.pause();
    convIdRef.current = `conv_${Date.now()}_${Math.round(Math.random() * 1e4)}`;
  };
  const toggleVoice = () => { const v = !voiceMode; setVoiceMode(v); voiceRef.current = v; };

  return (
    <div className="flex h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 font-bold">A</div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Ava — AI Refund Support</h1>
            <p className="text-xs text-slate-400 leading-tight">Acme Store · policy-grounded refund agent</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={"flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs " +
            (phoneConnected ? "border-emerald-600/50 text-emerald-300" : "border-slate-700 text-slate-500")}>
            <span className={"h-1.5 w-1.5 rounded-full " + (phoneConnected ? "bg-emerald-400" : "bg-slate-600")} />
            📞 Live
          </span>
          <button onClick={toggleVoice}
            className={"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors " +
              (voiceMode ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-slate-700 text-slate-300 hover:bg-slate-800")}>
            {voiceMode ? "🔊 Voice on" : "🔈 Voice off"}
          </button>
          <button onClick={reset} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
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
  );
}
