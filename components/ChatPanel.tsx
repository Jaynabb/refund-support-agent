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
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  const submit = () => { const t = input.trim(); if (!t) return; setInput(""); onSend(t); };

  // Push-to-talk: record mic audio → Whisper STT (/api/stt) → send the transcript.
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "speech.webm");
          const res = await fetch("/api/stt", { method: "POST", body: fd });
          const { text } = await res.json();
          if (text?.trim()) onSend(text.trim());
        } finally { setTranscribing(false); }
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch { setRecording(false); }
  };
  const stopRecording = () => { recRef.current?.stop(); setRecording(false); };
  const toggleMic = () => (recording ? stopRecording() : startRecording());

  return (
    <section className="flex min-h-0 flex-col border-r border-slate-800">
      <div className="border-b border-slate-800 px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        Customer chat
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-sm text-slate-500">
            Start a refund request, or pick a scenario above.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed " +
              (m.role === "user"
                ? "rounded-br-sm bg-indigo-600 text-white"
                : "rounded-bl-sm bg-slate-800 text-slate-100")
            }>
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-800 px-3.5 py-2.5 text-sm text-slate-400">
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

      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Type your message…"
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          />
          {/* Mic — push to talk: records → Whisper STT → sends the transcript. */}
          <button
            onClick={toggleMic}
            disabled={busy || transcribing}
            title={recording ? "Stop & send" : "Speak"}
            className={"grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-sm transition-colors disabled:opacity-40 " +
              (recording ? "animate-pulse border-rose-500 bg-rose-500/20 text-rose-300" : "border-slate-700 text-slate-300 hover:border-indigo-500")}
          >
            {transcribing ? "…" : recording ? "⏹" : "🎤"}
          </button>
          <button
            onClick={submit}
            disabled={busy || !input.trim()}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
