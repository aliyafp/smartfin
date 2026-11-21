/**
 * Server-only: picks the AI model used for reading receipts and statements.
 *
 * Order: Lovable AI gateway (LOVABLE_API_KEY, used on Lovable hosting) →
 * OpenAI (OPENAI_API_KEY) → Google Gemini (GEMINI_API_KEY). The first key found wins,
 * so the same code runs on Lovable and on other hosts such as Embarko.
 * Optional OPENAI_MODEL / GEMINI_MODEL override the default model.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, streamText } from "ai";

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]["providerOptions"]>;
import { createLovableAiGatewayRunIdFetch } from "@/lib/extract/server/run-id";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const GATEWAY_MODEL = "openai/gpt-6-astra";

export interface ResolvedModel {
  kind: "gateway" | "openai" | "gemini";
  provider: string;
  modelId: string;
  model: LanguageModel;
  /** Provider options for low-effort reasoning and no stored data, per provider. */
  providerOptions: ProviderOptions;
}

const env = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

export function resolveAiModel(): ResolvedModel | null {
  const lovableKey = env("LOVABLE_API_KEY");
  if (lovableKey) {
    const provider = createOpenAI({
      baseURL: GATEWAY_URL,
      apiKey: lovableKey,
      headers: { "Lovable-API-Key": lovableKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: createLovableAiGatewayRunIdFetch().fetch,
    });
    return {
      kind: "gateway", provider: "Lovable AI Gateway", modelId: GATEWAY_MODEL, model: provider.responses(GATEWAY_MODEL),
      providerOptions: { openai: { reasoningEffort: "low", store: false } },
    };
  }
  const openaiKey = env("OPENAI_API_KEY");
  if (openaiKey) {
    const modelId = env("OPENAI_MODEL") ?? "gpt-5-mini";
    return {
      kind: "openai", provider: "OpenAI", modelId, model: createOpenAI({ apiKey: openaiKey }).responses(modelId),
      providerOptions: { openai: { reasoningEffort: "low", store: false } },
    };
  }
  const geminiKey = env("GEMINI_API_KEY") ?? env("GOOGLE_GENERATIVE_AI_API_KEY");
  if (geminiKey) {
    const modelId = env("GEMINI_MODEL") ?? "gemini-2.5-flash";
    return {
      kind: "gemini", provider: "Google Gemini", modelId, model: createGoogleGenerativeAI({ apiKey: geminiKey })(modelId),
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 1024 } } },
    };
  }
  return null;
}
