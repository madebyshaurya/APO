import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// OpenRouter (OpenAI-compatible) configuration
// Defaults target OpenRouter. You can still point to any compatible baseURL.
// Env vars:
// - OPENROUTER_API_KEY (preferred) or OPENAI_API_KEY (fallback)
// - OPENROUTER_BASE_URL (defaults to https://openrouter.ai/api/v1)
// - OPENROUTER_SITE_URL, OPENROUTER_APP_NAME (optional headers per OpenRouter guidelines)
export const openai = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
  headers: {
    ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
    ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {}),
  },
});

// Google Gemini provider for AI SDK (used by generateText/generateObject)
export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

// Use OpenRouter-style model slugs by default
export const defaultModel = process.env.AI_MODEL || "openai/gpt-4o-mini";
export const getModelName = () => process.env.AI_MODEL || "openai/gpt-4o-mini";

// Factory to pick the AI SDK model by slug.
// Supports:
// - "openai/..." → OpenRouter/OpenAI via @ai-sdk/openai
// - "google/..." → Gemini via @ai-sdk/google
export const aiModel = (name: string) => {
  if (!name) name = defaultModel;
  if (name.startsWith("google/")) {
    const modelId = name.replace(/^google\//, "");
    return google(modelId) as any;
  }
  return openai(name) as any;
};
