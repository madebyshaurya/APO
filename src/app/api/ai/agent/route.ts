import { NextRequest } from "next/server";
import { buildAgentGraph } from "@/lib/ai/graphs/agent.graph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt: string | undefined = body?.prompt;
  if (!prompt) return new Response(JSON.stringify({ ok: false, error: "Missing 'prompt'" }), { status: 400 });

  const graph = buildAgentGraph();
  const messages = [
    new SystemMessage("You are an agent that decides whether to think, search the web, or write/edit a diagram. Use tools only when they are helpful."),
    new HumanMessage(prompt),
  ];

  // Run the graph to completion
  const finalState = await graph.invoke({ messages });

  // Try to find mermaid from any tool result messages
  let mermaid: string | undefined;
  const trace: string[] = [];
  for (const m of finalState.messages) {
    const anyMsg = m as unknown as { tool?: string; content?: unknown; _getType?: () => string };
    if (anyMsg?.tool) {
      trace.push(`tool:${anyMsg.tool}`);
      try {
        const data = JSON.parse(anyMsg.content as string);
        if (data?.mermaid && !mermaid) mermaid = data.mermaid;
      } catch {}
    } else if (anyMsg._getType?.() === "ai") {
      trace.push("ai");
    }
  }

  return new Response(JSON.stringify({ ok: true, mermaid, trace }), {
    headers: { "Content-Type": "application/json" },
  });
}

