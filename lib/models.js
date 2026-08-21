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
    baseUrl: "https://api.moonshot.cn/v1",
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
  return {
    spec: `${providerKey}:${modelId}`,
    providerKey,
    provider,
    modelId,
    apiKey,
    hasKey: Boolean(apiKey),
    label: (CATALOGUE.find((c) => c.spec === `${providerKey}:${modelId}`) || {}).label || modelId,
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
