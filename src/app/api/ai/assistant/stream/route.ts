import { NextRequest } from "next/server";
import OpenAI from "openai";
import { fcSearch } from "@/lib/ai/tools/firecrawl";
import { dagToMermaid } from "@/lib/mermaid/compile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sse(data: string, event?: string) {
  const enc = new TextEncoder();
  return enc.encode(`${event ? `event: ${event}\n` : ""}data: ${data}\n\n`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const prompt = searchParams.get("prompt") || "";
  const modelName = process.env.AI_MODEL || "gpt-4o-mini";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: any) => {
        controller.enqueue(sse(JSON.stringify(payload), event));
      };

      const close = () => controller.close();
      try {
        console.log("[assistant/stream] start", { modelName, hasKey: !!process.env.OPENAI_API_KEY, promptLen: prompt.length });
        if (!process.env.OPENAI_API_KEY) {
          send("error", { message: "OPENAI_API_KEY not set" });
          close();
          return;
        }
        if (!prompt) {
          send("error", { message: "Missing prompt" });
          close();
          return;
        }

        const client = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL || undefined,
        });

        send("log", { message: `Starting assistant with model ${modelName}` });
        console.log("[assistant/stream] initialized client", { modelName });

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
              description: "Create or update a Mermaid flowchart from a prompt or DAG.",
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

        const sys = [
          "You are Apo, an autonomous planning assistant on a whiteboard.",
          "Decide which tools to use. Use web_search only when fresh info is needed.",
          "When the instruction implies a plan/process/steps, you MUST call write_mermaid to produce a flowchart.",
        ].join(" ")

        let messages: any[] = [
          { role: "system", content: sys },
          { role: "user", content: prompt },
        ];

        let finalText = "";
        let mermaid: string | null = null;

        const t0 = Date.now();
        for (let i = 0; i < 6; i++) {
          send("log", { message: `LLM turn ${i + 1}` });
          const tCall = Date.now();
          const resp = await client.chat.completions.create({
            model: modelName,
            messages,
            tools,
            tool_choice: "auto" as any,
          });
          const tCallMs = Date.now() - tCall;
          if ((resp as any)?.usage) {
            const { prompt_tokens, completion_tokens, total_tokens } = (resp as any).usage;
            send("usage", { prompt_tokens, completion_tokens, total_tokens });
            console.log("[assistant/stream] usage", { turn: i + 1, prompt_tokens, completion_tokens, total_tokens, tCallMs });
          } else {
            console.log("[assistant/stream] call duration", { turn: i + 1, tCallMs });
          }
          const msg = resp.choices[0].message as any;
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
            for (const call of msg.tool_calls) {
              const name = call.function?.name;
              let args: any = {};
              try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch {}
              send("log", { message: `tool:${name}`, args });
              console.log("[assistant/stream] tool_call", { name, args });
              let toolResult: any = null;
              if (name === "web_search") {
                try {
                  const data = await fcSearch({
                    query: args.query,
                    limit: args.limit ?? 6,
                    tbs: args.tbs ?? "w",
                    sources: args.sources ?? ["web", "news"],
                  });
                  const count = (data?.results?.web?.length || 0) + (data?.results?.news?.length || 0);
                  send("log", { message: `web_search results: ${count}` });
                  console.log("[assistant/stream] web_search results", { count });
                  toolResult = data;
                } catch (e: any) {
                  const err = { error: e?.message ?? String(e) };
                  send("log", { message: `web_search error`, err });
                  console.error("[assistant/stream] web_search error", err);
                  toolResult = err;
                }
              } else if (name === "write_mermaid") {
                try {
                  let d = args.dag;
                  if (!d) {
                    const dagResp = await client.chat.completions.create({
                      model: modelName,
                      messages: [
                        { role: "system", content: "Return ONLY valid JSON for a DAG with fields {nodes,edges}." },
                        { role: "user", content: args.prompt || prompt },
                      ],
                      response_format: { type: "json_object" } as any,
                    });
                    const json = dagResp.choices[0].message?.content || "{}";
                    d = JSON.parse(json);
                  }
                  mermaid = dagToMermaid(d);
                  send("mermaid", { code: mermaid });
                  console.log("[assistant/stream] write_mermaid emitted code", { length: mermaid?.length || 0 });
                  toolResult = { mermaid, dag: d };
                } catch (e: any) {
                  const err = { error: e?.message ?? String(e) };
                  send("log", { message: `write_mermaid error`, err });
                  console.error("[assistant/stream] write_mermaid error", err);
                  toolResult = err;
                }
              }
              messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(toolResult) });
            }
          } else {
            finalText = msg.content || "";
            break;
          }
        }

        // Stream text in chunks (simple faux streaming)
        if (finalText) {
          const chunks = finalText.match(/.{1,60}/g) || [];
          for (const ch of chunks) {
            send("text", { chunk: ch });
            await new Promise(r => setTimeout(r, 20));
          }
        }
        const totalMs = Date.now() - t0;
        send("done", { ok: true, ms: totalMs });
        console.log("[assistant/stream] done", { ms: totalMs });
        close();
      } catch (e: any) {
        console.error("[assistant/stream] fatal", e);
        try { controller.enqueue(sse(JSON.stringify({ message: e?.message ?? String(e) }), "error")); } catch {}
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
