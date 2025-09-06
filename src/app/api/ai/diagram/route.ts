import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { aiModel, defaultModel } from "@/lib/ai/client";
import { DagSchema } from "@/lib/ai/schemas";
import { dagToMermaid } from "@/lib/mermaid/compile";

export const dynamic = "force-dynamic"; // avoid caching
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt: string | undefined = body?.prompt;
  const sources: any[] = Array.isArray(body?.sources) ? body.sources : [];
  const allowed = ["openai/gpt-4o-mini", "openai/gpt-4o", "google/gemini-2.5-flash"] as const;
  const sanitizeModel = (m?: string) => (m && (allowed as readonly string[]).includes(m)) ? m : (process.env.AI_MODEL || "openai/gpt-4o-mini");
  const modelName: string = sanitizeModel(body?.model || defaultModel);

  const needsGoogle = modelName.startsWith("google/");
  const hasOpenAI = !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
  const hasGoogle = !!process.env.GOOGLE_API_KEY;

  if ((needsGoogle && !hasGoogle) || (!needsGoogle && !hasOpenAI)) {
    return NextResponse.json(
      {
        ok: false,
        error: needsGoogle
          ? "Google API key not set. Add GOOGLE_API_KEY to your .env.local."
          : "OpenRouter/OpenAI API key is not set. Add OPENROUTER_API_KEY (preferred) or OPENAI_API_KEY.",
      },
      { status: 503 }
    );
  }

  if (!prompt) {
    return NextResponse.json({ ok: false, error: "Missing 'prompt'" }, { status: 400 });
  }

  const sys = [
    "You are a senior product+systems planner.",
    "Return a concise DAG JSON with fields {nodes,edges} following the provided JSON schema.",
    "Nodes should be atomic actionable steps; include optional 'phase' to group steps.",
    "Do not include commentary."
  ].join(" ");

  const userText = `Idea:\n${prompt}\n\nOptional sources (titles/urls):\n${sources
    .map((s) => (typeof s === "string" ? s : s?.title || s?.url || ""))
    .filter(Boolean)
    .join("\n")}`;

  try {
    const { object: dag } = await generateObject({
      model: aiModel(modelName) as any,
      schema: DagSchema,
      system: sys,
      prompt: userText,
    });

    const mermaid = dagToMermaid(dag);
    return NextResponse.json({ ok: true, dag, mermaid, model: modelName });
  } catch (err: any) {
    if (modelName !== "openai/gpt-4o-mini") {
      try {
        const { object: dag } = await generateObject({
          model: aiModel("openai/gpt-4o-mini") as any,
          schema: DagSchema,
          system: sys,
          prompt: userText,
        });
        const mermaid = dagToMermaid(dag);
        return NextResponse.json({ ok: true, dag, mermaid, model: "openai/gpt-4o-mini", fallback: true });
      } catch (e2: any) {
        return NextResponse.json({ ok: false, error: e2?.message ?? String(e2) }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
