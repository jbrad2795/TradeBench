// Thin OpenAI Responses API client with a deterministic offline mode.
//
// Offline mode (no OPENAI_API_KEY) returns schema-correct stub output for every
// call shape the engine makes, so the full pipeline - logging, termination,
// elicitation, scoring - can be exercised without spending credits or waiting on
// a key. Stubs are keyed off the agent so runs are varied but reproducible.

const ENDPOINT = "https://api.openai.com/v1/responses";
const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export function isLive() {
  const k = process.env.OPENAI_API_KEY;
  // A non-empty placeholder must not count as a real key - that bug shipped in
  // server.js and made every turn 401 instead of falling back to demo.
  return Boolean(k && k.trim() && !/^your_api_key_here$/i.test(k.trim()));
}

export function modelName() {
  return process.env.OPENAI_MODEL || "gpt-5.6-luna";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} opts
 * @param {string} opts.instructions  system-role instructions
 * @param {string} opts.input         user-role turn input
 * @param {boolean} [opts.json]       expect a JSON object back
 * @param {number} [opts.maxTokens]
 * @param {object} [opts.stub]        offline fallback value
 */
export async function callModel({ instructions, input, json = false, maxTokens = 2500, stub, retries = 3 }) {
  if (!isLive()) {
    await sleep(5);
    return { text: json ? JSON.stringify(stub) : String(stub), parsed: json ? stub : undefined, demo: true, usage: null };
  }

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(2 ** attempt * 500);
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelName(),
          instructions,
          input,
          max_output_tokens: maxTokens,
        }),
      });
    } catch (networkError) {
      lastError = networkError;
      continue;
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      lastError = new Error(result?.error?.message || `HTTP ${response.status}`);
      if (RETRY_STATUS.has(response.status)) continue;
      throw lastError;
    }

    const text =
      result.output_text ||
      result.output?.flatMap((x) => x.content || []).find((x) => x.type === "output_text")?.text;

    // The Responses API reports truncation explicitly. Catch it here: a cut-off
    // reply is valid JSON right up to the point it stops, so it otherwise shows
    // up as a silent parse failure with no obvious cause.
    const truncated =
      result.status === "incomplete" &&
      result.incomplete_details?.reason === "max_output_tokens";

    if (truncated && attempt < retries) {
      // Reasoning tokens come out of the same budget, so headroom must be real.
      maxTokens = Math.min(Math.ceil(maxTokens * 2), 16000);
      lastError = new Error(`output truncated at max_output_tokens; retrying with ${maxTokens}`);
      continue;
    }

    if (!text) {
      lastError = new Error("Model returned no output text (raise max_output_tokens?)");
      continue;
    }

    return {
      text: text.trim(),
      parsed: json ? parseJson(text) : undefined,
      demo: false,
      truncated,
      usage: result.usage ?? null,
    };
  }
  throw lastError;
}

/** Models wrap JSON in prose or fences often enough to be worth handling. */
export function parseJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch { /* fall through */ }
    }
    return null;
  }
}
