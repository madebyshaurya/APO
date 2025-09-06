import { NextRequest } from "next/server";
import { streamText, generateObject, tool } from "ai";
import { aiModel } from "@/lib/ai/client";
import { fcSearch } from "@/lib/ai/tools/firecrawl";
import { dagToMermaid } from "@/lib/mermaid/compile";
import { z } from "zod";
import { DagSchema, ExSpecSchema } from "@/lib/ai/schemas";
import { specToExcalidrawSkeleton } from "@/lib/board/specToExcalidraw";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sse(data: string, event?: string) {
  const enc = new TextEncoder();
  return enc.encode(`${event ? `event: ${event}\n` : ""}data: ${data}\n\n`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const prompt = searchParams.get("prompt") || "";
  const modelParam = searchParams.get("model") || undefined;
  const ctxId = searchParams.get("ctx") || undefined;
  const allowed = ["openai/gpt-4o-mini", "openai/gpt-4o", "google/gemini-2.5-flash"] as const;
  const sanitizeModel = (m?: string) => (m && (allowed as readonly string[]).includes(m)) ? m : "openai/gpt-4o-mini";
  const modelName = sanitizeModel(modelParam || process.env.AI_MODEL || "openai/gpt-4o-mini");
  const isGoogle = modelName.startsWith("google/");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: any) => {
        controller.enqueue(sse(JSON.stringify(payload), event));
      };
      const close = () => controller.close();

      try {
        console.log("[assistant/stream] start", { modelName, hasOpenAIKey: !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY), hasGoogleKey: !!process.env.GOOGLE_API_KEY, promptLen: prompt.length });
        if (isGoogle && !process.env.GOOGLE_API_KEY) {
          send("error", { message: "Google API key not set" });
          return close();
        }
        if (!isGoogle && !process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
          send("error", { message: "OpenRouter/OpenAI API key not set" });
          return close();
        }
        if (!prompt) {
          send("error", { message: "Missing prompt" });
          return close();
        }

        send("log", { message: `Starting assistant with model ${modelName}` });
        // Pull any provided canvas summary from the context store
        let canvasSummary: any = null;
        try { const mod = await import("@/lib/runtime/contextStore"); canvasSummary = mod.getContext(ctxId); } catch {}
        const tools = {
          web_search: tool({
            description: "Search the web/news using Firecrawl (fresh info).",
            inputSchema: z.object({
              query: z.string(),
              limit: z.number().int().min(1).max(10).optional(),
              tbs: z.string().optional(),
              sources: z.array(z.enum(["web", "news", "images"]))
                .optional(),
            }),
            execute: async ({ query, limit = 6, tbs = "w", sources = ["web", "news"] }: any) => {
              try {
                const data = await fcSearch({ query, limit, tbs, sources: sources as any });
                const count = ((data as any)?.results?.web?.length || 0) + ((data as any)?.results?.news?.length || 0);
                send("log", { message: `web_search results: ${count}` });
                return data;
              } catch (err: any) {
                const emsg = err?.message ?? String(err);
                send("error", { scope: "web_search", message: emsg });
                return { error: emsg };
              }
            },
          }),
          write_mermaid: tool({
            description: "Create or update a Mermaid flowchart from a prompt or DAG.",
            inputSchema: z.object({ prompt: z.string().optional(), dag: z.any().optional() }),
            execute: async ({ prompt: p, dag }: any) => {
              try {
                let d = dag;
                if (!d) {
                  const { object } = await generateObject({
                    model: aiModel(modelName),
                    schema: DagSchema,
                    system: "Produce a JSON object matching the DAG schema {nodes,edges}. No extra text.",
                    prompt: p || prompt,
                  });
                  d = object as any;
                }
                const code = dagToMermaid(d);
                send("mermaid", { code, dag: d });
                return { mermaid: code, dag: d };
              } catch (err: any) {
                const emsg = err?.message ?? String(err);
                send("error", { scope: "write_mermaid", message: emsg });
                return { error: emsg };
              }
            },
          }),
          draw_excalidraw: tool({
            description: "Draw boxes/arrows on the Excalidraw board via a JSON spec.",
            inputSchema: z.object({ prompt: z.string().optional(), spec: z.any().optional() }),
            execute: async ({ prompt: p, spec }: any) => {
              try {
                let s = spec;
                if (!s) {
                  const { object } = await generateObject({
                    model: aiModel(modelName),
                    schema: ExSpecSchema,
                    system: "Produce JSON matching ExSpec (nodes, edges, optional layout {direction,gapX,gapY,maxPerRow} and style). No extra text.",
                    prompt: p || prompt,
                  });
                  s = object as any;
                }
                const elements = specToExcalidrawSkeleton(s);
                send("excalidraw", { elements });
                return { ok: true, count: elements.length };
              } catch (err: any) {
                const emsg = err?.message ?? String(err);
                send("error", { scope: "draw_excalidraw", message: emsg });
                return { error: emsg };
              }
            },
          }),
          read_canvas: tool({
            description: "Read the current canvas summary (nodes, edges, selection/stats).",
            inputSchema: z.object({}).optional(),
            execute: async () => {
              if (!canvasSummary) return { empty: true };
              return canvasSummary;
            }
          }),
          search_canvas: tool({
            description: "Search canvas nodes by text and return matches with neighbor edges.",
            inputSchema: z.object({ query: z.string(), limit: z.number().int().optional().default(8) }),
            execute: async ({ query, limit }: any) => {
              if (!canvasSummary) return { matches: [] };
              const q = (query || "").toLowerCase();
              const nodes: any[] = canvasSummary.nodes || [];
              const edges: any[] = canvasSummary.edges || [];
              const score = (t: string) => {
                const idx = t.indexOf(q);
                return idx < 0 ? Infinity : idx + Math.max(0, t.length - q.length);
              };
              const ranked = nodes
                .map(n => ({ n, s: score((n.text || "").toLowerCase()) }))
                .filter(r => r.s !== Infinity)
                .sort((a,b)=>a.s-b.s)
                .slice(0, limit || 8);
              const byId = new Map(nodes.map((n:any)=>[n.id,n]));
              const results = ranked.map(r => {
                const id = r.n.id;
                const neigh = edges.filter((e:any)=> e.from===id || e.to===id);
                return { node: r.n, neighbors: neigh, snippet: r.n.text };
              });
              return { matches: results };
            }
          }),
        } as const;

        const sys = [
          "You are Apo, a research-first systems designer for software engineers.",
          "Decide freely which tool to use: web_search (fresh info), write_mermaid (flowchart), draw_excalidraw (boxes/arrows).",
          "Prefer clear, minimal explanations. For diagrams, choose layout and visuals yourself—only add layout hints when needed.",
          "Examples:",
          "- To sketch a split FE/BE plan: draw_excalidraw with nodes ['frontend','backend'] and edges root->each.",
          "- To express detailed workflows: write_mermaid with phases as subgraphs.",
        ].join(" ");

        const result = await streamText({ model: aiModel(modelName), tools, system: sys, prompt });
        for await (const delta of result.textStream) {
          if (delta) send("text", { chunk: delta });
        }
        send("done", { ok: true });
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
