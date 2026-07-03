"use client";

import { useConversation } from "@elevenlabs/react";
import { useState } from "react";

// Real-time voice: connects the browser straight to the Ava agent over WebRTC —
// continuous conversation with automatic turn-taking (no push-to-talk). Ava's
// tool calls fire server-side (webhooks → our policy engine), so the reasoning
// panel and CRM update live during the call. Must be inside <ConversationProvider>.
export function VoiceCall() {
  const conversation = useConversation();
  const [connecting, setConnecting] = useState(false);
  const status = conversation.status;
  const active = status === "connected";
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

  const label = connecting
    ? "Connecting…"
    : active
    ? (speaking ? "● Ava speaking — end" : "● Listening — end")
    : "🎙️ Talk to Ava (live)";

  return (
    <button
      onClick={active ? () => conversation.endSession() : start}
      disabled={connecting}
      className={"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 " +
        (active
          ? "animate-pulse border-emerald-500 bg-emerald-500/20 text-emerald-200"
          : "border-indigo-500 bg-indigo-600/20 text-indigo-100 hover:bg-indigo-600/30")}
    >
      {label}
    </button>
  );
}
