// Models 郁郁 (GPT) can use through OpenRouter. Shared by the client picker
// and the server routes so only these IDs are ever sent upstream.
export const GPT_MODELS = [
  { id: "gpt56sol", label: "GPT-5.6 Sol", apiId: "openai/gpt-5.6-sol" },
  { id: "gpt6sol", label: "GPT-6 Sol", apiId: "openai/gpt-6-sol" },
  { id: "gpt6astra", label: "GPT-6 Astra", apiId: "openai/gpt-6-astra" },
] as const;

export type GptModel = (typeof GPT_MODELS)[number];

export const DEFAULT_GPT_MODEL: GptModel = GPT_MODELS[0];

/** Resolve a settings id (e.g. "gpt6sol") or an API id to a known model. */
export function resolveGptModel(value: unknown): GptModel {
  const text = String(value || "").trim().toLowerCase();
  return GPT_MODELS.find((model) => model.id === text || model.apiId === text) || DEFAULT_GPT_MODEL;
}

/** Return the API id only when it is one of the allowed GPT models. */
export function allowedGptApiId(value: unknown): string | null {
  const text = String(value || "").trim().toLowerCase();
  return GPT_MODELS.find((model) => model.apiId === text)?.apiId || null;
}
