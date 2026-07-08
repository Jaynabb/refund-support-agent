// Imports the Twilio phone number into ElevenLabs Conversational AI and assigns it
// to the Ava agent in one call. After this, inbound calls to the number are answered
// by Ava, whose server tools hit the deployed policy engine.
//
// This repoints the number's Twilio voice webhook to ElevenLabs and sends the Twilio
// Account SID + Auth Token to ElevenLabs (required to connect the two services).
//
// Reads:
//   ELEVENLABS_API_KEY        from ./.env.local
//   TWILIO_ACCOUNT_SID/TOKEN  from process.env (source them from AIOS/.env)
//
// Usage:  TWILIO_ACCOUNT_SID=.. TWILIO_AUTH_TOKEN=.. node scripts/import-twilio-number.mjs

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);

const EL_KEY = env.ELEVENLABS_API_KEY;
const AGENT_ID = env.ELEVENLABS_AGENT_ID;
const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const NUMBER = process.env.PHONE_NUMBER || "+18669354129";

for (const [k, v] of Object.entries({ ELEVENLABS_API_KEY: EL_KEY, ELEVENLABS_AGENT_ID: AGENT_ID, TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN })) {
  if (!v) { console.error(`Missing ${k}`); process.exit(1); }
}

const body = {
  phone_number: NUMBER,
  label: "Ava — Acme Refunds",
  sid: SID,
  token: TOKEN,
  provider: "twilio",
  agent_id: AGENT_ID,
};

const res = await fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", {
  method: "POST",
  headers: { "xi-api-key": EL_KEY, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) { console.error("import failed", res.status, text); process.exit(1); }

const data = JSON.parse(text);
console.log(`✅ Imported ${NUMBER} → assigned to agent ${AGENT_ID}`);
console.log("   phone_number_id:", data.phone_number_id || data.phone_number_id || JSON.stringify(data));
console.log("   inbound calls now answered by Ava on the deployed policy engine.");
