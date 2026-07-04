"use client";

import { useConversation } from "@elevenlabs/react";
import { useState } from "react";

// Inline mic button that lives in the chat input row. Connects the browser
// straight to the Ava agent over WebRTC — continuous conversation with automatic
// turn-taking (no push-to-talk). Ava's tool calls fire server-side (webhooks →
// our policy engine), so the reasoning panel and CRM update live while you speak.
// Must be rendered inside <ConversationProvider>.
export function VoiceCall() {
  const conversation = useConversation();
  const [connecting, setConnecting] = useState(false);
  const active = conversation.status === "connected";
  const speaking = conversation.isSpeaking;

  const start = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/voice/signed-url");
      const { signedUrl } = await res.json();
      if (!signedUrl) throw new Error("no signed url");
      conversation.startSession({ signedUrl });
    } catch (e) {
      console.error("voice start failed", e);
    } finally {
      setConnecting(false);
    }
  };

  const title = connecting
    ? "Connecting…"
    : active
    ? (speaking ? "Ava speaking — tap to end" : "Listening — tap to end")
    : "Talk to Ava (live voice)";

  return (
    <button
      onClick={active ? () => conversation.endSession() : start}
      disabled={connecting}
      title={title}
      aria-label={title}
      className={
        "relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors disabled:opacity-50 " +
        (active
          ? "border-emerald-500 bg-emerald-50 text-emerald-600"
          : "border-slate-300 text-slate-500 hover:border-[#FF6900] hover:text-[#FF6900]")
      }
    >
      {active && <span className="absolute inset-0 animate-ping rounded-lg bg-emerald-400/30" />}
      {connecting ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#FF6900]" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      )}
    </button>
  );
}
