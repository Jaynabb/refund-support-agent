# Ava — AI Customer Support Agent (Refunds)

A full-stack web app where an LLM agent handles e-commerce refund requests over chat
(and voice), **grounded in a strict refund policy it cannot override**. The agent
orchestrates tools and explains its decisions; a deterministic policy engine makes the
actual eligibility calls. Every step streams live to an admin reasoning panel.

> **Design thesis:** a support agent is only trustworthy if it *holds the line*. So the
> LLM never decides eligibility from vibes — it calls a deterministic policy engine, and
> even the refund tool re-verifies policy before moving money. The model is the
> communicator; the engine is the authority.

## Demo at a glance

- **Standard refund** → agent looks up the order, checks policy, issues the refund (and
  transparently **retries** a simulated payment-gateway blip).
- **Policy violation** → agent denies, cites the exact rule, and **stays firm when the
  customer pushes back** — it re-runs the policy check rather than caving.
- **Escalation** → over-cap or flagged-account refunds are routed to a human with a ticket.
- **Live reasoning panel** → tool calls, the full policy rule-by-rule audit trail,
  retries, and the final decision, streamed in real time.

## Architecture

```
Browser (Next.js, split view)
  ├─ Customer chat  ──POST /api/agent──►  Agent loop (server, Node runtime)
  └─ Reasoning panel ◄──── SSE stream ────┘   │
                                              ├─ Claude (tool-use loop)  ← orchestrates + explains
                                              └─ Tools
                                                   ├─ lookup_customer / lookup_order   (CRM)
                                                   ├─ check_refund_policy  ─► Policy Engine  ← DECIDES
                                                   └─ issue_refund         ─► re-checks Policy Engine
```

- **`lib/policy/engine.ts`** — the deterministic heart. Pure function: `(order, reason,
  refundHistory) → { decision, eligibleAmount, rules[] }`. Returns every rule it checked
  with pass/fail + a plain-English reason, so decisions are fully auditable.
- **`lib/agent/loop.ts`** — a hand-written Claude tool-use loop (not the SDK's auto-runner)
  so it can emit a streaming event for every step: reasoning, tool call, tool result,
  policy check, **retry**, decision, reply. Prompt-caches the stable system prompt.
- **`lib/tools/index.ts`** — the tool layer. `issue_refund` **re-evaluates the policy
  engine** before refunding — the LLM cannot cause a non-compliant refund even if it tries.
- **`lib/data/`** — 15-profile CRM (`crm.ts`) and the binding policy (`policy.md`). Each
  profile's order is crafted to hit a specific policy branch (approve, each denial reason,
  and a partial mixed-eligibility order).
- **`app/api/agent/route.ts`** — streams the agent's events to the browser as SSE.
- **`components/`** — `ChatPanel` (customer) and `ReasoningPanel` (live admin timeline).

## The policy (enforced deterministically)

30-day return window · non-refundable items (final-sale, digital) refund only the
refundable portion of a mixed order · no double refunds · agent holds the line on a
valid denial and never invents exceptions. Full text in
[`lib/data/policy.md`](lib/data/policy.md).

## Run it

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Click a scenario chip, or type a request like *"refund for ORD-1001, it's defective."*

### Environment

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | **Required.** The agent brain. |
| `ANTHROPIC_MODEL` | Optional. Default `claude-sonnet-4-6` (fast, good for voice). Use `claude-opus-4-8` for max reasoning. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | Voice output (TTS). |
| `OPENAI_API_KEY` | Voice input (Whisper STT). |

## Sample scenarios

| Order | Reason | Outcome |
|-------|--------|---------|
| ORD-1001 | defective | ✅ Approve $79.99 (with a retry) |
| ORD-1002 | any | ❌ Deny — outside 30-day window |
| ORD-1003 | any | ❌ Deny — final-sale item |
| ORD-1006 | damaged | ⚠️ Escalate — over $500 cap |
| ORD-1007 | defective | ⚠️ Escalate — flagged account |
| ORD-1010 | damaged | 📷 Ask for photo (evidence rule) |
| ORD-1015 | defective | ✅ Partial — final-sale line excluded |

## Tech

Next.js (App Router) · TypeScript · Anthropic Claude (tool use) · Server-Sent Events ·
Tailwind. Voice: ElevenLabs TTS + Whisper STT.

## Stack notes

- **Why a deterministic engine + LLM, not "let the LLM decide":** refund correctness is a
  compliance problem. The engine makes decisions reproducible and auditable; the LLM makes
  them human. This is also what makes "holding the line" reliable rather than promptcraft.
- **Why a manual tool loop:** it's the only way to stream a truthful, step-by-step
  reasoning trace (including retries) to the admin panel — the SDK's auto-runner hides it.
- **Why Sonnet by default:** the agent is latency-sensitive (voice). Swap to Opus via one
  env var when reasoning depth matters more than speed.
