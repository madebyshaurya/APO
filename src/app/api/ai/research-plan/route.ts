import { NextRequest, NextResponse } from "next/server";
import { fcSearch } from "@/lib/ai/tools/firecrawl";
import { dagToMermaid } from "@/lib/mermaid/compile";
import { DagSchema } from "@/lib/ai/schemas";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query: string | undefined = body?.query;
  if (!query) return NextResponse.json({ ok: false, error: "Missing 'query'" }, { status: 400 });

  // Firecrawl search first
  try {
    const data = await fcSearch({
      query,
      limit: body?.limit ?? 6,
      sources: body?.sources ?? ["web", "news"],
      tbs: body?.tbs ?? "w",
      scrapeOptions: body?.scrapeOptions,
    });

    const groups = data?.results || data?.data || data;
    const all = [
      ...(groups?.web || []),
      ...(groups?.news || []),
      ...(Array.isArray(groups) ? groups : []),
    ];

    const top = all.slice(0, 8).map((r: any) => ({
      title: r?.title || r?.url,
      url: r?.url,
      snippet: r?.snippet || "",
    }));

    // LangChain structured generation (OpenRouter-compatible)
    const allowed = ["openai/gpt-4o-mini", "openai/gpt-4o"] as const;
    const sanitizeModel = (m?: string) => (m && (allowed as readonly string[]).includes(m)) ? m : "openai/gpt-4o-mini";
    const modelName = sanitizeModel(process.env.AI_MODEL || "openai/gpt-4o-mini");
    const llm = new ChatOpenAI({
      model: modelName,
      apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
      temperature: 0.3,
      configuration: {
        baseURL: process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
        baseOptions: {
          headers: {
            ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
            ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {}),
          },
        },
      },
    }).withStructuredOutput(DagSchema);

    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        [
          "You are a senior product+systems planner.",
          "Return a concise plan as a DAG with fields {nodes,edges}.",
          "Nodes should be atomic steps and may include a 'phase' to group work.",
          "No commentary; only the JSON object per schema.",
        ].join(" "),
      ],
      [
        "user",
        [
          `Research query: ${query}`,
          "Relevant sources (title - url - snippet):",
          top.map((t) => `- ${t.title} — ${t.url}\n  ${t.snippet}`).join("\n"),
          "Produce the DAG.",
        ].join("\n\n"),
      ],
    ]);

    let dag;
    try {
      dag = await prompt.pipe(llm).invoke({});
    } catch (e1: any) {
      if (modelName !== "openai/gpt-4o-mini") {
        const fallback = new ChatOpenAI({
          model: "openai/gpt-4o-mini",
          apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
          temperature: 0.3,
          configuration: {
            baseURL: process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
            baseOptions: {
              headers: {
                ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
                ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {}),
              },
            },
          },
        }).withStructuredOutput(DagSchema);
        dag = await prompt.pipe(fallback).invoke({});
        const mermaid = dagToMermaid(dag);
        return NextResponse.json({ ok: true, dag, mermaid, citations: top, model: "openai/gpt-4o-mini", fallback: true });
      }
      throw e1;
    }
    const mermaid = dagToMermaid(dag);
    return NextResponse.json({ ok: true, dag, mermaid, citations: top, model: modelName });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
