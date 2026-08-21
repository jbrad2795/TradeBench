// Provider-agnostic model client.
//
// Three wire formats cover everything we need: OpenAI's Responses API, the
// OpenAI-compatible chat-completions format (DeepSeek, Kimi, GLM, Qwen), and
// Anthropic's Messages API. Each adapter returns the same normalised shape:
//
//   { text, parsed, truncated, usage, demo }
//
// Offline mode (no key for the selected model) returns schema-correct stubs so
// the pipeline runs without spending anything.

import { resolveModel } from "./models.js";

const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function isLive(spec) {
  try {
    return resolveModel(spec).hasKey;
  } catch {
    return false;
  }
}

export function modelName(spec) {
  try {
    return resolveModel(spec).spec;
  } catch {
    return String(spec || "unknown");
  }
}

/**
 * Models wrap JSON in prose or fences, and emit trailing commas, often enough to
 * be worth handling. Observed live: 12% of Schema D and E responses failed on a
 * trailing comma before a closing brace.
 *
 * Repairs are conservative - fences, surrounding prose, trailing commas. Nothing
 * here invents content; a genuinely malformed reply still returns null so the
 * caller can retry rather than record a silent half-answer.
 */
export function parseJson(text) {
  const raw = String(text);
  const attempts = [];

  const stripped = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  attempts.push(stripped);

  // Trailing comma before a closing brace or bracket.
  const noTrailingCommas = stripped.replace(/,(\s*[}\]])/g, "$1");
  attempts.push(noTrailingCommas);

  // Outermost object only, in case the model wrapped it in commentary.
  const start = noTrailingCommas.indexOf("{");
  const stop = noTrailingCommas.lastIndexOf("}");
  if (start !== -1 && stop > start) attempts.push(noTrailingCommas.slice(start, stop + 1));

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch { /* try the next repair */ }
  }
  return null;
}

// --- adapters -------------------------------------------------------------

function openaiResponses(resolved, { instructions, input, maxTokens }) {
  return {
    url: `${resolved.provider.baseUrl}/responses`,
    headers: {
      authorization: `Bearer ${resolved.apiKey}`,
      "content-type": "application/json",
    },
    body: {
      model: resolved.modelId,
      instructions,
      input,
      ...(maxTokens ? { max_output_tokens: maxTokens } : {}),
    },
    read: (r) => ({
      text:
        r.output_text ||
        r.output?.flatMap((x) => x.content || []).find((x) => x.type === "output_text")?.text ||
        null,
      truncated: r.status === "incomplete" && r.incomplete_details?.reason === "max_output_tokens",
      usage: r.usage ?? null,
    }),
  };
}

function openaiChat(resolved, { instructions, input, maxTokens }) {
  return {
    url: `${resolved.provider.baseUrl}/chat/completions`,
    headers: {
      authorization: `Bearer ${resolved.apiKey}`,
      "content-type": "application/json",
    },
    body: {
      model: resolved.modelId,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: input },
      ],
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    },
    read: (r) => ({
      text: r.choices?.[0]?.message?.content ?? null,
      truncated: r.choices?.[0]?.finish_reason === "length",
      usage: r.usage ?? null,
    }),
  };
}

// EXPERIMENTAL (branch: caching-chronological-experiment). Two independent
// cache_control breakpoints, well under Anthropic's 4-per-request limit:
//
//   1. The system prompt (instructions) is ALWAYS marked cacheable. It is
//      identical across every call a given seat makes in a run (facts,
//      brief, private info, disposition and rules never change mid-run), so
//      this is an unconditional win with no bookkeeping required.
//   2. The user turn is split into a cached prefix + an uncached tail when
//      the caller supplies cachedPrefix (see the note above ask() in
//      lib/engine.js for how that string is derived and why it is safe to
//      treat as an exact byte-prefix of input). Below Anthropic's ~1024
//      token minimum, the API silently declines to cache it - no error, no
//      special-casing needed here.
//
// If this branch is abandoned, reverting this function to a plain-string
// system field and a single-block message restores pre-branch behaviour.
// Exported for direct unit testing of the cache-block construction, without
// needing a real API call. Not part of the stable public surface.
export function anthropicMessages(resolved, { instructions, input, maxTokens, cachedPrefix }) {
  const userContent =
    cachedPrefix && input.startsWith(cachedPrefix)
      ? [
          { type: "text", text: cachedPrefix, cache_control: { type: "ephemeral" } },
          { type: "text", text: input.slice(cachedPrefix.length) },
        ]
      : input;

  return {
    url: `${resolved.provider.baseUrl}/messages`,
    headers: {
      "x-api-key": resolved.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: {
      model: resolved.modelId,
      system: [{ type: "text", text: instructions, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
      // Anthropic requires this field, so an uncapped run still needs a ceiling.
      max_tokens: maxTokens || 16000,
    },
    read: (r) => ({
      text: (r.content || []).filter((c) => c.type === "text").map((c) => c.text).join("") || null,
      truncated: r.stop_reason === "max_tokens",
      usage: r.usage ?? null,
    }),
  };
}

const ADAPTERS = {
  "openai-responses": openaiResponses,
  "openai-chat": openaiChat,
  anthropic: anthropicMessages,
};

// --- the call ------------------------------------------------------------

/**
 * @param {object} opts
 * @param {string} opts.instructions   system-role text
 * @param {string} opts.input          user-role text
 * @param {boolean} [opts.json]        expect a JSON object back
 * @param {number} [opts.maxTokens]    output ceiling. Optional, but set it:
 *   with no cap a reasoning model spends an unbounded thinking budget and
 *   measured latency went from ~2s to ~168s per call. The cap bounds wall
 *   clock, not just spend. Set it generously rather than omitting it.
 * @param {object} [opts.stub]         offline fallback value
 * @param {string} [opts.model]        provider:model-id, defaults to TB_MODEL
 * @param {string} [opts.cachedPrefix] EXPERIMENTAL, caching-chronological-experiment
 *   branch only: a prefix of `input` already sent (and cached) on a prior
 *   call for this seat. Only the Anthropic adapter uses it; other providers
 *   ignore it silently.
 */
export async function callModel({
  instructions,
  input,
  json = false,
  maxTokens,
  stub,
  model,
  cachedPrefix,
  retries = 3,
}) {
  const resolved = resolveModel(model);

  if (!resolved.hasKey) {
    await sleep(5);
    return {
      text: json ? JSON.stringify(stub) : String(stub),
      parsed: json ? stub : undefined,
      demo: true,
      truncated: false,
      usage: null,
    };
  }

  const build = ADAPTERS[resolved.provider.kind];
  if (!build) throw new Error(`No adapter for provider kind "${resolved.provider.kind}"`);

  let cap = maxTokens;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(2 ** attempt * 500);

    const req = build(resolved, { instructions, input, maxTokens: cap, cachedPrefix });
    let response;
    try {
      response = await fetch(req.url, {
        method: "POST",
        headers: req.headers,
        body: JSON.stringify(req.body),
      });
    } catch (networkError) {
      lastError = networkError;
      continue;
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = result?.error?.message || result?.message || `HTTP ${response.status}`;
      lastError = new Error(`${resolved.spec}: ${detail}`);
      if (RETRY_STATUS.has(response.status)) continue;
      throw lastError;
    }

    const { text, truncated, usage } = req.read(result);

    // A cut-off reply is valid JSON right up to where it stops, so without this
    // it surfaces as a silent parse failure with no obvious cause.
    if (truncated && cap && attempt < retries) {
      cap = Math.min(Math.ceil(cap * 2), 32000);
      lastError = new Error(`output truncated; retrying with ${cap}`);
      continue;
    }

    if (!text) {
      lastError = new Error(`${resolved.spec}: returned no output text`);
      continue;
    }

    const parsed = json ? parseJson(text) : undefined;
    if (json && !parsed && attempt < retries) {
      lastError = new Error(`${resolved.spec}: reply was not parseable JSON; retrying`);
      continue;
    }

    return {
      text: text.trim(),
      parsed,
      demo: false,
      truncated: Boolean(truncated),
      usage,
    };
  }
  throw lastError;
}
