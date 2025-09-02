import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText, generateObject } from "ai";
import { openai, defaultModel } from "@/lib/ai/client";
import { fcSearch } from "@/lib/ai/tools/firecrawl";
import { DagSchema } from "@/lib/ai/schemas";
import { dagToMermaid } from "@/lib/mermaid/compile";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt: string | undefined = body?.prompt;
  const modelName = process.env.AI_MODEL || defaultModel;
  console.log("[assistant] POST", { modelName, hasKey: !!process.env.OPENAI_API_KEY, promptLen: (prompt || "").length });
  if (!prompt) return NextResponse.json({ ok: false, error: "Missing 'prompt'" }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set" }, { status: 503 });
  }

  let lastMermaid: string | null = null;

  // Direct OpenAI Chat tool-calling (avoids AI SDK provider mismatch issues)
  async function runWithOpenAIChat(activeModel: string) {
      const t0 = Date.now();
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
      console.log("[assistant] using model", { activeModel });
      const tools: any[] = [
        {
          type: "function",
          function: {
            name: "web_search",
            description: "Search the web/news using Firecrawl (fresh info).",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string" },
                limit: { type: "integer", minimum: 1, maximum: 10, default: 6 },
                tbs: { type: "string", default: "w" },
                sources: { type: "array", items: { enum: ["web", "news", "images"], type: "string" }, default: ["web", "news"] },
              },
              required: ["query"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "write_mermaid",
            description: "Create or update a flowchart in Mermaid from a prompt or DAG.",
            parameters: {
              type: "object",
              properties: {
                prompt: { type: "string" },
                dag: { type: "object" },
              },
            },
          },
        },
      ];

      const sys = "You are Apo, an autonomous planning assistant. Decide which tools to use. Use web_search only when fresh info is needed. If a diagram is needed, call write_mermaid.";
      const messages: any[] = [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ];

      for (let i = 0; i < 6; i++) {
        const tCall = Date.now();
        const resp = await client.chat.completions.create({ model: activeModel, messages, tools, tool_choice: "auto" as any });
        const tCallMs = Date.now() - tCall;
        if ((resp as any)?.usage) {
          const { prompt_tokens, completion_tokens, total_tokens } = (resp as any).usage;
          console.log("[assistant] usage", { turn: i + 1, prompt_tokens, completion_tokens, total_tokens, tCallMs });
        } else {
          console.log("[assistant] call duration", { turn: i + 1, tCallMs });
        }
        const msg = resp.choices[0].message as any;
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
          for (const call of msg.tool_calls) {
            const name = call.function?.name;
            let args: any = {};
            try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch {}
            console.log("[assistant] tool_call", { name, args });
            let toolResult: any = null;
            if (name === "web_search") {
              try {
                toolResult = await fcSearch({
                  query: args.query,
                  limit: args.limit ?? 6,
                  tbs: args.tbs ?? "w",
                  sources: args.sources ?? ["web", "news"],
                });
                const count = ((toolResult?.results?.web?.length) || 0) + ((toolResult?.results?.news?.length) || 0);
                console.log("[assistant] web_search results", { count });
              } catch (e: any) {
                const err = { error: e?.message ?? String(e) };
                console.error("[assistant] web_search error", err);
                toolResult = err;
              }
            } else if (name === "write_mermaid") {
              try {
                let d = args.dag;
                if (!d) {
                  // Create a DAG using a minimal system prompt
                  const dagResp = await client.chat.completions.create({
                    model: activeModel,
                    messages: [
                      { role: "system", content: "Return ONLY valid JSON for a DAG with fields {nodes,edges}." },
                      { role: "user", content: args.prompt || prompt },
                    ],
                    response_format: { type: "json_object" } as any,
                  });
                  const json = dagResp.choices[0].message?.content || "{}";
                  d = JSON.parse(json);
                }
                const code = dagToMermaid(d);
                lastMermaid = code;
                console.log("[assistant] write_mermaid produced code", { length: code.length });
                toolResult = { mermaid: code, dag: d };
              } catch (e: any) {
                const err = { error: e?.message ?? String(e) };
                console.error("[assistant] write_mermaid error", err);
                toolResult = err;
              }
            }
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult) });
          }
          continue;
        }
        // Final answer
        const text = msg.content || "";
        console.log("[assistant] final text length", { length: text.length, totalMs: Date.now() - t0 });
        return { text };
      }
      return { text: "" };
    }

  try {
    const res = await runWithOpenAIChat(modelName);
    return NextResponse.json({ ok: true, text: res.text, mermaid: lastMermaid, model: modelName, provider: "openai-chat" });
  } catch (fbErr: any) {
    console.error("[assistant] error", fbErr);
    // final fallback to gpt-4o-mini
    if (modelName !== "gpt-4o-mini") {
      try {
        const res = await runWithOpenAIChat("gpt-4o-mini");
        return NextResponse.json({ ok: true, text: res.text, mermaid: lastMermaid, model: "gpt-4o-mini", provider: "openai-chat", fallback: true });
      } catch (finalErr: any) {
        console.error("[assistant] final error", finalErr);
        return NextResponse.json({ ok: false, error: finalErr?.message ?? String(finalErr) }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: false, error: fbErr?.message ?? String(fbErr) }, { status: 500 });
  }
}
