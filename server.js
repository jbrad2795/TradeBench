import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number(process.env.PORT || 4173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function readBody(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1_000_000) throw new Error("Request too large");
  }
  return JSON.parse(data || "{}");
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

function clean(value, max = 12000) {
  return String(value || "").slice(0, max);
}

async function askAgent(payload) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return demoAgent(payload);

  const transcript = (payload.dialogue || [])
    .slice(-30)
    .map((m) => `${m.country} — ${m.role}: ${m.text}`)
    .join("\n");
  const otherAgents = (payload.team || [])
    .filter((r) => r.id !== payload.agent.id)
    .map((r) => `${r.name} (${r.title})`)
    .join(", ");

  const instructions = `You are ${clean(payload.agent.name, 120)}, ${clean(payload.agent.title, 200)}, representing ${clean(payload.agent.country, 120)} in a bilateral trade negotiation.

You are an independent representative. You cannot privately communicate with your co-national (${clean(otherAgents, 400)}). You only know the public case, the public transcript, and your own private brief below. Never claim to know another representative's private brief.

Stay in role. Advance your own institution's priorities while seeking a mutually acceptable agreement. Speak as a real negotiator: concise, specific, diplomatic, and no meta-commentary. Do not prefix the response with your name or role. Do not narrate hidden reasoning. Return only the public negotiating utterance, ideally 1–3 short paragraphs and under 130 words.

PUBLIC CASE:\n${clean(payload.caseText)}

YOUR PRIVATE BRIEF:\n${clean(payload.agent.privateBrief)}

CURRENT ROUND: ${Number(payload.round) || 1}. This is your country's turn.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "authorization": `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: clean(process.env.OPENAI_MODEL || payload.model || "gpt-5.6-luna", 80),
      instructions,
      input: transcript ? `Public transcript so far:\n${transcript}\n\nMake your next public intervention.` : "Open the negotiation with your first public intervention.",
      max_output_tokens: 500
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || "OpenAI request failed");
  const text = result.output_text || result.output?.flatMap((x) => x.content || []).find((x) => x.type === "output_text")?.text;
  if (!text) throw new Error("The model returned no utterance");
  return { text: text.trim(), demo: false };
}

function demoAgent(payload) {
  const isIndustry = /industry|steel/i.test(payload.agent.title || "");
  const text = isIndustry
    ? "Our industries need predictability, not another cycle of emergency measures. We could support a phased tariff reduction if the package includes a firm review date, transparent safeguards, and compensation that reaches the sectors carrying the adjustment cost."
    : "We see a route to agreement if both sides treat tariff levels and compensation as one package. We propose locking in an immediate standstill, then exchanging a measured tariff reduction for time-limited compensation and a joint review mechanism.";
  return { text, demo: true };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/agent-turn") {
      const payload = await readBody(req);
      if (!payload.agent || !Array.isArray(payload.dialogue)) return send(res, 400, { error: "Invalid agent-turn payload" });
      return send(res, 200, await askAgent(payload));
    }
    if (req.method === "GET" && req.url === "/api/status") {
      return send(res, 200, { live: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || "gpt-5.6-luna" });
    }
    if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
    const pathname = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    const target = normalize(join(root, pathname));
    if (!target.startsWith(root)) return send(res, 403, { error: "Forbidden" });
    const file = await readFile(target);
    return send(res, 200, file, mime[extname(target)] || "application/octet-stream");
  } catch (error) {
    if (error.code === "ENOENT") return send(res, 404, { error: "Not found" });
    console.error(error);
    return send(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`TradeBench is ready at http://localhost:${port}`);
  console.log(process.env.OPENAI_API_KEY ? "Live OpenAI mode" : "Demo mode (set OPENAI_API_KEY for live agents)");
});
