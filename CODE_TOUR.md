# Code Tour — narration script & prep

A recording-ready script for the walkthrough video. Each stop has **SAY** (what to say,
in your words — paraphrase freely) and **SHOW** (the file + the exact thing to point at).
Then a **Q&A cheat-sheet** for follow-up questions. Target length: ~3–4 minutes.

If you internalize just one sentence, make it this:
**"The model is the communicator; a deterministic engine is the authority."**
Every design choice falls out of that.

---

## 0. Open (15s)

**SHOW:** the live app, run `refund for ORD-1001, it's defective`, let the panel stream.

**SAY:** "This is Ava — an AI refund support agent over chat, voice, and a real phone
line. The interesting part isn't that an LLM answers — it's that the LLM is *not allowed*
to decide whether you get a refund. A deterministic policy engine does that. The model
gathers info, calls the engine, and explains the result. Let me show you how that's wired."

---

## 1. The authority — `lib/policy/engine.ts` (45s)

**SHOW:** `evaluateRefund(...)` — the four `rules.push(...)` gates, then the `hardDeny` /
decision block, then the `return { decision, eligibleAmount, rules, summary }`.

**SAY:** "This is the whole decision, and there's no AI in it. `evaluateRefund` is a pure
function — order in, decision out. It checks four gates: delivered, not already refunded,
inside the 30-day window, and whether any items are refundable. It returns *every* rule it
checked with a pass/fail and a plain-English reason — that's what makes the decision
auditable, and it's exactly what you saw rendered in the panel. Partial refunds just fall
out: non-refundable items get filtered from the eligible amount, so a mixed order refunds
only the part it should. Because it's deterministic, the same order always gives the same
answer — that's what lets Ava *hold the line* under pressure instead of getting talked into
an exception."

**WHY (for your understanding):** an LLM asked "should I refund this?" will sometimes say
yes to be helpful. A pure function never will. Compliance problems want reproducibility.

---

## 2. The tools — `lib/tools/index.ts` (45s)

**SHOW:** the `TOOLS` object (four tools), then scroll to `issue_refund`'s handler and
point at the re-evaluation block (`if (evaluation.decision !== "approve") return { refused }`).

**SAY:** "The model gets four tools: look up a customer, look up an order, check policy,
and issue a refund. Each is a schema the model sees plus a plain handler. The one that
matters is `issue_refund` — before it moves any money, it **re-runs the policy engine**
and refuses if it doesn't approve. So even if the model were jailbroken into calling
`issue_refund` on a denied order, the refund would be blocked here. The decision gate isn't
just the check the model is *asked* to do — it's re-enforced at the point money moves."

**SHOW:** the `gatewayFirstAttempt` block that `throw new RetryableToolError(...)`.

**SAY:** "This line simulates a flaky payment gateway — the first attempt on any order
throws a retryable error — so you can see the agent's retry handling in the trace."

---

## 3. The orchestrator — `lib/agent/loop.ts` (45s)

**SHOW:** the `for (let step...)` loop, the `system: [{ ... cache_control }]`, and
`runToolWithRetry`.

**SAY:** "For chat, this is a hand-written Claude tool-use loop — deliberately *not* the
SDK's auto-runner. I wrote it by hand so I can emit an event for every single step:
reasoning, tool call, result, the policy audit, retries, the decision, the reply. That's
what streams to the panel. The auto-runner would hide all of that. The system prompt —
instructions plus the actual policy text — is prompt-cached, since it's stable across
turns. And every tool call is wrapped in `runToolWithRetry`, which catches the retryable
gateway error, backs off, and emits a retry event — the amber row you saw."

**WHY:** the panel can only be *truthful* if the loop reports real steps. A manual loop is
the price of an honest reasoning trace.

---

## 4. Voice & phone — one engine, three doors (45s)

**SHOW:** `components/VoiceCall.tsx` (the `useConversation` + signed-url fetch), then
`app/api/agent-tools/[tool]/route.ts` (the `TOOL_MAP` → `TOOLS[name].handler`).

**SAY:** "Voice and phone don't re-implement any of this. In-browser voice uses ElevenLabs'
Conversational AI over WebRTC — the browser gets a short-lived signed URL so the API key
stays server-side. The phone line is a Twilio number pointed at the same ElevenLabs agent.
Here's the key part: the ElevenLabs agent's 'tools' are webhooks that call *this* route —
which dispatches to the **exact same** `TOOLS[name].handler` the chat loop uses. So whether
you typed, spoke, or called, you hit the same tools and the same engine. Behavior can't
drift between channels — there's one source of truth for what a refund decision is."

**WHY:** two orchestrators (Claude for text, ConvAI for voice/phone), one authority. That
convergence is the architectural point worth landing.

---

## 5. Close (15s)

**SAY:** "So: the LLM makes it human — it talks, it reasons out loud, it stays warm even
when it's saying no. The engine makes it trustworthy — reproducible, auditable, can't be
argued out of policy. And the reasoning panel makes both of them accountable, live.
That's the design."

---

## Q&A cheat-sheet — likely follow-ups

**Q: Why a deterministic engine instead of just prompting the model well?**
Refund eligibility is a compliance decision — it has to be reproducible and auditable, and
it can't degrade under adversarial pressure. A prompt is a strong suggestion; a pure
function is a guarantee. The model is great at *communicating* the decision, bad at *being*
the decision of record.

**Q: Why write the tool loop by hand instead of the SDK's tool runner?**
I needed to stream a truthful, step-by-step reasoning trace — including retries — to the
admin panel. The auto-runner executes tools internally and hides the intermediate steps, so
you can't surface them. The manual loop yields an event per step.

**Q: How does "holding the line" actually work — isn't the model just told to?**
It's structural, not just prompted. On a pushback the model re-calls `check_refund_policy`,
which re-runs the same pure function and returns the same denial — so there's nothing to
cave to. And `issue_refund` re-checks policy independently, so even a mistaken approval
can't move money.

**Q: Voice and phone — is that a separate agent?**
Same *decision* logic, different *orchestrator*. Text uses a Claude loop; voice/phone use
an ElevenLabs ConvAI agent. Both call the identical tool handlers (`lib/tools/index.ts`)
and the identical engine, via `/api/agent-tools/*`. One authority, three entry points.

**Q: How would this scale to a real store?**
Swap the in-memory CRM (`lib/data/crm.ts`) for a real orders API, and the policy engine
stays a pure function you can unit-test exhaustively. Two things I'd add for production:
persist the activity log to a real store, and move the live event bus to a shared pub/sub
(Redis/Upstash) so the reasoning feed works across serverless instances — right now that's
in-memory, which is the one deployed limitation.

**Q: What happens if a tool call fails for real (not the simulated blip)?**
`runToolWithRetry` retries transient (`RetryableToolError`) failures with backoff; anything
non-retryable emits a `tool_error` event and returns a safe result to the model instead of
crashing the turn, so the agent can explain the problem rather than hang.

**Q: Why Claude Sonnet by default (with an Opus override)?**
Voice is latency-sensitive, so the default is the faster tier; `ANTHROPIC_MODEL` swaps to
Opus when reasoning depth matters more than speed. The decision quality doesn't depend on
the model anyway — the engine does that.

**Q: Where's the state? Is it a real database?**
It's an intentionally-scoped demo: a 15-profile in-memory CRM, each crafted to hit a
specific policy branch. The refund/retry state is in-memory and resets on restart. The
architecture (tools + engine + streaming) is the part built to production shape.
