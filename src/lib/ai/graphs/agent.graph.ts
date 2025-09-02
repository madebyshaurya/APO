import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { generateObject } from "ai";
import { openai as aiOpenAI } from "@/lib/ai/client";
import { DagSchema } from "@/lib/ai/schemas";
import { dagToMermaid } from "@/lib/mermaid/compile";
import { fcSearch } from "@/lib/ai/tools/firecrawl";

// Tools
export const webSearchTool = new DynamicStructuredTool({
  name: "web_search",
  description:
    "Search the web/news using Firecrawl. Use when you need current information or external references.",
  schema: z.object({
    query: z.string(),
    limit: z.number().int().positive().max(10).optional(),
    tbs: z.string().optional(),
    sources: z
      .array(z.enum(["web", "news", "images"]))
      .optional(),
  }),
  func: async ({ query, limit = 6, tbs = "w", sources = ["web", "news"] }) => {
    const data = await fcSearch({ query, limit, tbs, sources: sources as ("web"|"news"|"images")[] });
    const groups: any = (data as any)?.results || (data as any)?.data || data;
    const all = [
      ...(groups?.web || []),
      ...(groups?.news || []),
      ...(Array.isArray(groups) ? groups : []),
    ];
    const top = all.slice(0, limit).map((r: any) => ({
      title: r?.title || r?.url,
      url: r?.url,
      snippet: r?.snippet || "",
    }));
    return JSON.stringify({ results: top });
  },
});

export const writeDiagramTool = new DynamicStructuredTool({
  name: "write_mermaid",
  description:
    "Generate a project plan DAG and Mermaid flowchart from a prompt (and optionally considering recent search results).",
  schema: z.object({ prompt: z.string(), sources: z.array(z.any()).optional() }),
  func: async ({ prompt, sources = [] }) => {
    const sys = [
      "You convert product ideas and optional source notes into a concise DAG JSON that matches the schema.",
      "Nodes should be atomic actionable steps; include optional phase for grouping.",
    ].join(" ");
    const user = `Idea:\n${prompt}\n\nSources:\n${sources
      .map((s: any) => (typeof s === "string" ? s : s?.title || s?.url || ""))
      .filter(Boolean)
      .join("\n")}`;

    const { object: dag } = await generateObject({
      model: aiOpenAI(process.env.AI_MODEL || "gpt-4o-mini") as any,
      schema: DagSchema,
      system: sys,
      prompt: user,
    });
    const mermaid = dagToMermaid(dag as any);
    return JSON.stringify({ dag, mermaid });
  },
});

// Agent Graph
export function buildAgentGraph() {
  const tools = [webSearchTool, writeDiagramTool];
  const toolNode = new ToolNode(tools);

  const makeModel = (name: string) => new ChatOpenAI({ model: name, temperature: 0.2 }).bindTools(tools);
  let model = makeModel(process.env.AI_MODEL || "gpt-4o-mini");

  const agentNode = async (state: typeof MessagesAnnotation.State) => {
    try {
      const response = await model.invoke(state.messages);
      return { messages: [response] };
    } catch (err) {
      if ((process.env.AI_MODEL || "") !== "gpt-4o-mini") {
        model = makeModel("gpt-4o-mini");
        const response = await model.invoke(state.messages);
        return { messages: [response] };
      }
      throw err;
    }
  };

  const shouldContinue = (state: typeof MessagesAnnotation.State) => {
    const last = state.messages[state.messages.length - 1] as unknown as { tool_calls?: unknown[] };
    const hasToolCalls = !!last?.tool_calls && Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
    return hasToolCalls ? "tools" : "__end__";
  };

  const graph = new StateGraph({ stateSchema: MessagesAnnotation })
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addEdge("tools", "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("__start__", "agent")
    .compile();

  return graph;
}

