# Ava — AI Customer Support Agent (Refunds)

A full-stack app where an LLM agent handles e-commerce refund requests over **chat,
in-browser voice, and a real phone line** — grounded in a strict refund policy it
**cannot override**. The model orchestrates tools and explains its decisions in plain
language; a deterministic policy engine makes the actual eligibility calls. Every step
streams live to an admin reasoning panel.

**Live demo:** https://refund-agent-beta.vercel.app
**Repo:** https://github.com/Jaynabb/refund-support-agent

> **Design thesis:** a support agent is only trustworthy if it *holds the line.* So the
> LLM never decides eligibility from vibes — it calls a deterministic policy engine, and
> even the refund tool re-verifies policy before moving money. **The model is the
> communicator; the engine is the authority.**

---

## What it does

- **Standard refund** → agent looks up the order, checks policy, issues the refund — and
  transparently **retries** a simulated payment-gateway blip.
- **Policy violation** → agent denies, cites the exact rule, and **stays firm when the
  customer pushes back**: it re-runs the policy check rather than caving.
- **Partial refund** → on a mixed order it refunds only the eligible items and excludes
  the final-sale line, with the math shown.
- **Live reasoning panel** → tool calls, the rule-by-rule policy audit, retries, and the
  final decision, streamed in real time.

---

## Architecture

Three entry points, **one shared brain-stem** (tool layer + policy engine). The
orchestrator differs by channel; the *authority* never does.

```
  ┌─ Text chat ──────► /api/agent ──► Claude tool-use loop  (lib/agent/loop.ts)
  │                                        │
  ├─ In-browser voice ─► ElevenLabs ConvAI agent ─┐         │  both call the SAME
  │   (WebRTC, @elevenlabs/react)                 │         │  tool handlers…
  │                                               ▼         ▼
  └─ Phone call ─► Twilio ─► ElevenLabs ConvAI ─► /api/agent-tools/* ──┐
                                                                       │
                                    lib/tools/index.ts  ◄──────────────┘
                                          │  (lookup / check_policy / issue_refund)
                                          ▼
                                    lib/policy/engine.ts   ← DETERMINISTIC. DECIDES.
```

- **Two orchestrators, one authority.** Text chat is driven by a hand-written **Claude**
  tool-use loop. Voice and phone are driven by an **ElevenLabs ConvAI** agent whose
  "server tools" are webhooks into this same app. Both paths execute the *identical* tool
  handlers in `lib/tools/index.ts`, which call the *identical* policy engine — so
  eligibility decisions are channel-independent and reproducible.
- **`lib/policy/engine.ts`** — the deterministic heart. A pure function
  `(order, reason, refundHistory) → { decision, eligibleAmount, rules[] }`. It returns
  *every* rule it checked with pass/fail + a plain-English reason, so decisions are fully
  auditable. No LLM in the decision.
- **`lib/tools/index.ts`** — the tool layer. `issue_refund` **re-evaluates the policy
  engine before moving money** and refuses if it doesn't approve — the LLM cannot cause a
  non-compliant refund even if it tries. Also home to the simulated transient gateway
  failure that exercises the retry path.
- **`lib/agent/loop.ts`** — a manual Claude tool-use loop (not the SDK auto-runner) so it
  can emit a streaming event for every step: reasoning, tool call, tool result, policy
  audit, **retry**, decision, reply. Prompt-caches the stable system prompt.
- **`app/api/agent/route.ts`** — streams the loop's events to the browser as SSE.
- **`app/api/agent-tools/[tool]/route.ts`** — the webhook endpoints ElevenLabs calls
  during a voice/phone turn. Same handlers, same retry behavior, published to the live feed.
- **`lib/events/bus.ts` + `app/api/live/route.ts`** — an in-process event bus and its SSE
  relay, so the admin panel reflects voice-tool activity in real time.
- **`components/`** — `ChatPanel` + `VoiceCall` (customer), `ReasoningPanel` (live admin
  timeline), `CrmPanel`, `PolicyDoc`.

A full guided walkthrough is in [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## The policy (enforced deterministically)

30-day return window · non-refundable items (final-sale, digital) refund only the
refundable portion of a mixed order · no double refunds · the agent holds the line on a
valid denial and never invents exceptions. Full text in
[`lib/data/policy.md`](lib/data/policy.md); mirrored exactly in `lib/policy/engine.ts`.

---

## Reasoning logs — where failures & retries are handled

The retry/failure path is visible both on-screen (the reasoning panel) and in code:

| Concern | Where | What happens |
|--------|-------|--------------|
| Transient failure (simulated) | `lib/tools/index.ts` → `issue_refund` | First refund attempt per order throws `RetryableToolError` ("gateway 503"). |
| Retry — text chat | `lib/agent/loop.ts` → `runToolWithRetry` | Catches retryable errors, backs off, emits a `retry` event per attempt into the SSE stream. |
| Retry — voice/phone | `app/api/agent-tools/[tool]/route.ts` | Same retry loop, publishes `retry` to the event bus → `/api/live`. |
| Hard failure | `lib/agent/loop.ts` | Non-retryable errors emit a `tool_error` event and return a safe result to the model. |
| Policy refusal | `lib/tools/index.ts` → `issue_refund` | Re-checks the engine; returns `{ refused: true }` if not approved — blocks a bad refund. |
| Denials | `lib/policy/engine.ts` | `hardDeny` rules produce `decision: "deny"` with the failing rule as the reason. |

In the UI, the amber **RETRY** row and the red **✗** in the policy audit card are these
events rendered live.

---

## Run it locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (voice/phone vars optional)
npm run dev                  # http://localhost:3000
```

Type a request like *"refund for ORD-1001, it's defective"*, or tap the mic to talk.

### Environment

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | **Required.** The chat agent's brain (tool-use loop). |
| `ANTHROPIC_MODEL` | Optional. Default `claude-sonnet-4-6`; set `claude-opus-4-8` for max reasoning. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` / `ELEVENLABS_AGENT_ID` | Voice + phone (ConvAI). |

### Voice & phone setup

```bash
# Create/patch the ElevenLabs ConvAI agent, pointing its tools at a public URL:
node scripts/create-ava-agent.mjs https://<your-deploy-or-tunnel>
# Wire a Twilio number to the agent (imports + assigns in one call):
TWILIO_ACCOUNT_SID=.. TWILIO_AUTH_TOKEN=.. node scripts/import-twilio-number.mjs
```

Deployed on Vercel; the ConvAI agent's tools point at the production URL so the phone
line works 24/7. Serverless note: the deployed reasoning panel reflects chat/in-browser
voice; phone-call tool activity runs in separate serverless instances and isn't relayed
to the in-memory live feed (a shared pub/sub would close that gap).

---

## Sample scenarios

| Order | Reason | Outcome |
|-------|--------|---------|
| ORD-1001 | defective | ✅ Approve $79.99 (with a retry) |
| ORD-1002 | any | ❌ Deny — outside 30-day window |
| ORD-1003 | any | ❌ Deny — final-sale item |
| ORD-1015 | defective | ✅ Partial — final-sale line excluded |

---

## Tech

Next.js (App Router) · TypeScript · Anthropic Claude (tool use) · ElevenLabs
Conversational AI (voice + Twilio phone) · Server-Sent Events · Tailwind · deployed on
Vercel.

### Notable decisions

- **Deterministic engine + LLM, not "let the LLM decide."** Refund correctness is a
  compliance problem. The engine makes decisions reproducible and auditable; the LLM makes
  them human. It's also what makes "holding the line" reliable rather than promptcraft.
- **A manual tool loop.** The only way to stream a truthful, step-by-step reasoning trace
  (including retries) to the admin panel — the SDK's auto-runner hides it.
- **One tool layer for every channel.** Text (Claude) and voice/phone (ConvAI) are
  different orchestrators, but they share the exact tool handlers + engine, so behavior
  can't drift between how you typed and how you called.
