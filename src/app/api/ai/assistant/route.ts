import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateText, generateObject } from "ai";
import { aiModel, defaultModel } from "@/lib/ai/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fcSearch } from "@/lib/ai/tools/firecrawl";
import { DagSchema } from "@/lib/ai/schemas";
import { dagToMermaid } from "@/lib/mermaid/compile";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt: string | undefined = body?.prompt;
  const clientModel: string | undefined = body?.model;
  const allowed = ["openai/gpt-4o-mini", "openai/gpt-4o", "google/gemini-2.5-flash"] as const;
  const sanitizeModel = (m?: string) => (m && (allowed as readonly string[]).includes(m)) ? m : "openai/gpt-4o-mini";
  const files: { name: string; text?: string }[] = Array.isArray(body?.files) ? body.files : [];
  const modelName = sanitizeModel(clientModel || process.env.AI_MODEL || defaultModel);
  const isGoogle = modelName.startsWith("google/");
  console.log("[assistant] POST", { modelName, isGoogle, hasOpenAIKey: !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY), hasGoogleKey: !!process.env.GOOGLE_API_KEY, promptLen: (prompt || "").length, files: files.length });
  if (!prompt) return NextResponse.json({ ok: false, error: "Missing 'prompt'" }, { status: 400 });
  if ((isGoogle && !process.env.GOOGLE_API_KEY) || (!isGoogle && !process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY)) {
    return NextResponse.json({ ok: false, error: isGoogle ? "Google API key not set" : "OpenRouter/OpenAI API key not set" }, { status: 503 });
  }

  let lastMermaid: string | null = null;
  let lastDag: any | null = null;

  // AI SDK tool-calling path (Google Gemini)
  async function runWithGoogle(activeModel: string) {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
      const model = genAI.getGenerativeModel({ model: activeModel.replace(/^google\//, "") });
      const attachmentsText = files.slice(0, 5).map((f) => `\n\nAttachment: ${f.name}\n\n${(f.text || "").slice(0, 8000)}`).join("");
      const res = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt + attachmentsText }] }] } as any);
      const text = (res?.response?.text && res.response.text()) || "";
      try {
        const dagRes = await model.generateContent({ contents: [{ role: "user", parts: [{ text: `Return ONLY valid JSON for a DAG with fields {nodes,edges}.\n\n${prompt}` }] }] } as any);
        const json = (dagRes?.response?.text && dagRes.response.text()) || "{}";
        const d = JSON.parse(json);
        lastDag = d; lastMermaid = dagToMermaid(d);
      } catch {}
      return { text };
    }

  // Direct OpenAI Chat tool-calling (avoids AI SDK provider mismatch issues)
  async function runWithOpenAIChat(activeModel: string) {
      const t0 = Date.now();
      const client = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
        defaultHeaders: {
          ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
          ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {}),
        },
      });
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

      const sys = "You are Apo, a system design engineer on a whiteboard. Your job is to design clear system architectures and project plans for the user. Decide which tools to use; use web_search only when fresh info is needed. When a plan/process/architecture is implied, call write_mermaid to produce or update the diagram.";
      const messages: any[] = [
        { role: "system", content: sys },
        { role: "user", content: [
          { type: "text", text: prompt },
          ...files.slice(0, 5).map((f) => ({ type: "text", text: `\n\nAttachment: ${f.name}\n\n${(f.text || "").slice(0, 8000)}` })),
        ] },
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
                lastDag = d;
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
    const res = isGoogle ? await runWithGoogle(modelName) : await runWithOpenAIChat(modelName);
    return NextResponse.json({ ok: true, text: res.text, mermaid: lastMermaid, dag: lastDag, model: modelName, provider: "openrouter" });
  } catch (fbErr: any) {
    console.error("[assistant] error", fbErr);
    // final fallback to openai/gpt-4o-mini
    if (modelName !== "openai/gpt-4o-mini") {
      try {
        const res = await runWithOpenAIChat("openai/gpt-4o-mini");
        return NextResponse.json({ ok: true, text: res.text, mermaid: lastMermaid, dag: lastDag, model: "openai/gpt-4o-mini", provider: "openrouter", fallback: true });
      } catch (finalErr: any) {
        console.error("[assistant] final error", finalErr);
        return NextResponse.json({ ok: false, error: finalErr?.message ?? String(finalErr) }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: false, error: fbErr?.message ?? String(fbErr) }, { status: 500 });
  }
}
