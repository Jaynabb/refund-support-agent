# Architecture & Code Tour

A guided walkthrough of Ava — how a refund request flows through the system, how tools
are orchestrated, how voice/phone streams are handled, and where failures and retries
live. Doubles as a script for the Code Tour video.

---

## 0. The one idea

**The model communicates; a deterministic engine decides.** Everything below is in
service of that split. The LLM is never trusted to judge eligibility — it gathers inputs,
calls a pure-function policy engine, and explains the result. Even the money-moving tool
re-checks the engine. That's what makes "hold the line" a guarantee, not a prompt hope.

---

## 1. Request flow (the 30-second mental model)

```
Customer (chat | voice | phone)
      │
      ▼
Orchestrator          Text  → Claude tool-use loop      (lib/agent/loop.ts)
(picks + sequences    Voice → ElevenLabs ConvAI agent   (WebRTC)
 tool calls)          Phone → Twilio → ConvAI agent
      │
      ▼
Tool layer            lib/tools/index.ts
(lookup_customer, lookup_order, check_refund_policy, issue_refund)
      │
      ▼
Policy engine         lib/policy/engine.ts   ← pure function, THE decision
      │
      ▼
Reasoning panel       SSE stream → components/ReasoningPanel.tsx
(every step, live)
```

**The key structural point:** three different orchestrators, but they converge on **one**
tool layer and **one** engine. How you reached Ava (typed, spoke, or called) never changes
the decision.

---

## 2. Tour stops (in the order I'd record them)

### Stop 1 — The policy engine (`lib/policy/engine.ts`)
Start here, because it's the authority. `evaluateRefund(order, reason, refundHistory)` is a
**pure function**. It runs four gates — `delivered`, `not_already_refunded`,
`return_window` (30 days), `item_eligibility` — and returns:

```ts
{ decision: "approve" | "deny", eligibleAmount, rules: [{ rule, passed, detail }], summary }
```

Two things to point out on camera:
- It returns **every rule it checked**, with a human `detail` string — that's what powers
  the auditable panel card, and it's why a denial can always cite the exact rule.
- Partial refunds fall out naturally: non-refundable items (`final_sale`, `digital`) are
  filtered out of `eligibleAmount`, so a mixed order approves for just the refundable part.

### Stop 2 — The tool layer (`lib/tools/index.ts`)
Each tool is `{ definition, handler }` — the `definition` is the JSON schema the model
sees; the `handler` is deterministic code. Walk the four tools, then land on the money shot:

```ts
// issue_refund handler — the final gate
const evaluation = evaluateRefund(evalOrder, reason, customer.refundsLast90Days);
if (evaluation.decision !== "approve") {
  return { ok: false, refused: true, message: `Refund refused by policy engine: ${evaluation.summary}` };
}
```

Say it plainly: **`issue_refund` re-runs the engine before moving money.** Even if the
model were jailbroken into calling it on a denied order, the tool refuses. The LLM
physically cannot cause a non-compliant refund.

Also here: the **simulated transient failure** used to demo retries —
```ts
if (!gatewayFirstAttempt.has(id)) { gatewayFirstAttempt.add(id); throw new RetryableToolError("Payment gateway timeout (503)…"); }
```
First refund attempt per order throws a *retryable* error; the second succeeds.

### Stop 3 — The orchestrator for chat (`lib/agent/loop.ts`)
This is a **hand-written** Claude tool-use loop, deliberately not the SDK's auto-runner.
Why: so it can `yield` an event for **every** step (reasoning, tool_call, tool_result,
policy_check, retry, decision, agent_message). Point out:
- `system` is sent with `cache_control: ephemeral` → the stable policy+instructions prefix
  is **prompt-cached** across turns.
- The loop is bounded (`for step < 8`) so it can't spin.
- `runToolWithRetry(...)` wraps every handler call — see Stop 5.
- After `check_refund_policy`, it emits dedicated `policy_check` + `decision` events so the
  panel can render the audit card and the APPROVE/DENY chip.

### Stop 4 — Voice & phone stream handling
Voice and phone don't use the Claude loop — they use an **ElevenLabs ConvAI** agent that
handles STT ↔ LLM ↔ TTS and turn-taking natively. What connects it to *this* app is
**server tools**: webhooks the ConvAI agent calls mid-conversation.

- **In-browser voice** — `components/VoiceCall.tsx` uses `@elevenlabs/react`
  (`useConversation`) to open a **WebRTC** session. It fetches a short-lived signed URL
  from `app/api/voice/signed-url/route.ts` (keeps the API key server-side), then streams
  audio directly to ElevenLabs. No push-to-talk — continuous, with automatic turn-taking.
- **Phone** — `scripts/import-twilio-number.mjs` imports a Twilio number into ElevenLabs
  and assigns it to the same agent; Twilio routes inbound calls to ConvAI.
- **The shared seam** — both point at `app/api/agent-tools/[tool]/route.ts`. That route
  maps the ConvAI tool name to the **same `TOOLS[name].handler`** the chat loop uses. So
  voice/phone get the identical lookups, the identical policy checks, the identical retry
  behavior. The ConvAI agent is defined in `scripts/create-ava-agent.mjs` (system prompt +
  the four server-tool schemas pointing at the deployed `/api/agent-tools/*`).

### Stop 5 — Reasoning logs: failures & retries
This is the "show me where it handles failures" stop. Two symmetric retry paths, because
there are two orchestrators — both wrapping the *same* handlers:

- **Chat:** `lib/agent/loop.ts` → `runToolWithRetry()`. On a `RetryableToolError` it backs
  off (`400ms * attempt`) and emits a `retry` event; on a non-retryable error it emits
  `tool_error` and returns a safe result to the model instead of throwing.
- **Voice/phone:** `app/api/agent-tools/[tool]/route.ts` runs the same retry loop and
  `publish()`es each `retry` to the in-process event bus (`lib/events/bus.ts`), which
  `app/api/live/route.ts` relays to the panel over SSE.

On screen, that surfaces as the amber **RETRY** row ("issue_refund transient error — retry
1/2") and, for denials, the red **✗** on the failing rule in the policy card. Point at the
live panel while narrating — the events you see *are* these code paths.

### Stop 6 — Rendering (`components/ReasoningPanel.tsx`, `app/page.tsx`)
`app/page.tsx` holds the split view and subscribes to two streams: the per-request SSE from
`/api/agent` (chat) and the always-on `/api/live` feed (voice/phone tools). `ReasoningPanel`
renders each event type with its own treatment — the policy audit gets the rule-by-rule
card; retries get the amber row; the decision gets a chip.

---

## 3. Design decisions worth defending

- **Deterministic engine, not LLM judgment.** Refunds are a compliance surface;
  reproducibility and auditability beat cleverness. The engine is ~60 lines and testable.
- **Manual tool loop over the SDK runner.** Needed to stream a *truthful* step-by-step
  trace — retries included. The auto-runner hides intermediate steps.
- **One tool layer across channels.** Text (Claude) and voice/phone (ConvAI) are different
  brains, but sharing the handler + engine means behavior can't drift by channel.
- **Re-check inside `issue_refund`.** Defense in depth: the decision gate isn't just the
  `check_refund_policy` call the model is *asked* to make — it's re-enforced at the point
  money moves.

## 4. Known limitation (called out honestly)
On Vercel's serverless runtime the event bus is in-memory per-instance, so the deployed
admin panel reflects **chat and in-browser voice** but not **phone-call** tool activity
(the webhook and the SSE stream can land on different instances). The phone line itself
works fully; only the live *panel mirroring* of a phone call needs a shared pub/sub
(Upstash / Vercel KV) to close the gap.
