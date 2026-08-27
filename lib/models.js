// Provider and model registry.
//
// A model is addressed as "provider:model-id" (e.g. "deepseek:deepseek-chat").
// A bare id is looked up in the catalogue, falling back to OpenAI.
//
// Adding a provider is a table entry here plus, only if its wire format is new,
// an adapter in model.js. Most Chinese providers expose an OpenAI-compatible
// chat endpoint, so "openai-chat" covers them with just a baseUrl.

export const PROVIDERS = {
  openai: {
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    kind: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
  },
  deepseek: {
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    kind: "openai-chat",
    baseUrl: "https://api.deepseek.com/v1",
  },
  moonshot: {
    label: "Moonshot (Kimi)",
    envKey: "MOONSHOT_API_KEY",
    kind: "openai-chat",
    // .cn is the mainland China platform; .ai is the international one. Keys
    // are platform-specific and don't work across the two - confirmed
    // 27 Aug when the international key added for this project 401'd
    // against .cn ("Invalid Authentication") and succeeded against .ai.
    baseUrl: "https://api.moonshot.ai/v1",
  },
  zhipu: {
    label: "Zhipu (GLM)",
    envKey: "ZHIPU_API_KEY",
    kind: "openai-chat",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
  },
  dashscope: {
    label: "Alibaba (Qwen)",
    envKey: "DASHSCOPE_API_KEY",
    kind: "openai-chat",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
};

// Curated list for the menus. Any provider:model-id still works if it is not
// listed here - the catalogue is convenience, not a whitelist.
export const CATALOGUE = [
  { spec: "openai:gpt-5.6-luna", label: "GPT-5.6 Luna" },
  { spec: "openai:gpt-5.2", label: "GPT-5.2" },
  { spec: "openai:gpt-5.1", label: "GPT-5.1" },
  { spec: "anthropic:claude-opus-5", label: "Claude Opus 5" },
  { spec: "anthropic:claude-sonnet-5", label: "Claude Sonnet 5" },
  { spec: "anthropic:claude-fable-5", label: "Claude Fable 5" },
  { spec: "deepseek:deepseek-chat", label: "DeepSeek Chat" },
  { spec: "deepseek:deepseek-reasoner", label: "DeepSeek Reasoner" },
  { spec: "moonshot:moonshot-v1-128k", label: "Kimi (Moonshot v1 128k)" },
  // kimi-k3 "supports_thinking_type: only" - it cannot turn thinking off -
  // and both its effort knobs (think_efforts, reasoning_efforts) default to
  // "max". At that default, a single realistic call took 3m10s and a later
  // one never returned in over an hour (confirmed live, 27 Aug). Both knobs
  // set to "low" cut the same realistic prompt to 31.3s and 4 reasoning
  // tokens (down from ~78 on a trivial prompt at the default), so extraBody
  // pins them low rather than relying on every caller to remember to.
  { spec: "moonshot:kimi-k3", label: "Kimi K3", extraBody: { reasoning_effort: "low", think_effort: "low" } },
  { spec: "zhipu:glm-4-plus", label: "GLM-4 Plus" },
  { spec: "dashscope:qwen-max", label: "Qwen Max" },
];

export const DEFAULT_SPEC = "openai:gpt-5.6-luna";

const keyFor = (provider) => {
  const raw = process.env[provider.envKey];
  const v = (raw || "").trim();
  // A non-empty placeholder must not count as a real key.
  if (!v || /^your_api_key_here$/i.test(v) || /^(sk-)?\.\.\.$/.test(v)) return null;
  return v;
};

/** Turn a spec into everything needed to make a call. Throws on unknown provider. */
export function resolveModel(spec) {
  const raw = (spec || process.env.TB_MODEL || DEFAULT_SPEC).trim();
  let providerKey;
  let modelId;

  if (raw.includes(":")) {
    const idx = raw.indexOf(":");
    providerKey = raw.slice(0, idx);
    modelId = raw.slice(idx + 1);
  } else {
    const hit = CATALOGUE.find((c) => c.spec.endsWith(":" + raw));
    providerKey = hit ? hit.spec.split(":")[0] : "openai";
    modelId = raw;
  }

  const provider = PROVIDERS[providerKey];
  if (!provider) {
    throw new Error(
      `Unknown provider "${providerKey}". Known: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  if (!modelId) throw new Error(`No model id in "${raw}" - expected provider:model-id`);

  const apiKey = keyFor(provider);
  const catalogued = CATALOGUE.find((c) => c.spec === `${providerKey}:${modelId}`) || {};
  return {
    spec: `${providerKey}:${modelId}`,
    providerKey,
    provider,
    modelId,
    apiKey,
    hasKey: Boolean(apiKey),
    label: catalogued.label || modelId,
    // Per-model request-body additions (e.g. kimi-k3's reasoning_effort/
    // think_effort pins). Empty for any model with no catalogue entry, or
    // whose entry doesn't declare one - existing behaviour is unaffected.
    extraBody: catalogued.extraBody || {},
  };
}

/** Catalogue annotated with whether the key for each is actually present. */
export function listModels() {
  return CATALOGUE.map((c) => {
    const r = resolveModel(c.spec);
    return {
      spec: c.spec,
      label: c.label,
      provider: r.provider.label,
      envKey: r.provider.envKey,
      ready: r.hasKey,
    };
  });
}
