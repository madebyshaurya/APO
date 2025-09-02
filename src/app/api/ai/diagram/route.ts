import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { openai, defaultModel } from "@/lib/ai/client";
import { DagSchema } from "@/lib/ai/schemas";
import { dagToMermaid } from "@/lib/mermaid/compile";

export const dynamic = "force-dynamic"; // avoid caching
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt: string | undefined = body?.prompt;
  const sources: any[] = Array.isArray(body?.sources) ? body.sources : [];
  const modelName: string = body?.model || defaultModel;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "OPENAI_API_KEY is not set. Add it to your .env (you may also set OPENAI_BASE_URL for OpenAI-compatible providers) and try again.",
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
      model: openai(modelName) as any,
      schema: DagSchema,
      system: sys,
      prompt: userText,
    });

    const mermaid = dagToMermaid(dag);
    return NextResponse.json({ ok: true, dag, mermaid, model: modelName });
  } catch (err: any) {
    if (modelName !== "gpt-4o-mini") {
      try {
        const { object: dag } = await generateObject({
          model: openai("gpt-4o-mini") as any,
          schema: DagSchema,
          system: sys,
          prompt: userText,
        });
        const mermaid = dagToMermaid(dag);
        return NextResponse.json({ ok: true, dag, mermaid, model: "gpt-4o-mini", fallback: true });
      } catch (e2: any) {
        return NextResponse.json({ ok: false, error: e2?.message ?? String(e2) }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}

