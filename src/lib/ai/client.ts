import { createOpenAI } from "@ai-sdk/openai";

// Configure OpenAI or any OpenAI-compatible endpoint via env.
// If you want to use OpenRouter/Together, set OPENAI_BASE_URL and OPENAI_API_KEY accordingly.
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL, // optional
});

export const defaultModel = process.env.AI_MODEL || "gpt-4o-mini";
export const getModelName = () => process.env.AI_MODEL || "gpt-4o-mini";

