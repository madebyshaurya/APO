"use client";

import { useEffect, useRef, useState } from "react";
import { useMermaidCode } from "../mermaid/MermaidContext";
import { emitAddDiagram } from "@/lib/board/events";

// Dynamically import mermaid on the client to avoid SSR issues
const useMermaid = () => {
  const mermaidRef = useRef<any>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const mm = (await import("mermaid")).default;
      mm.initialize({ startOnLoad: false, theme: "default" });
      if (mounted) mermaidRef.current = mm;
    })();
    return () => {
      mounted = false;
    };
  }, []);
  return mermaidRef;
};


export default function DiagramPanel() {
  const mermaidRef = useMermaid();
  const { code, setCode } = useMermaidCode();
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [renderCount, setRenderCount] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [trace, setTrace] = useState<string[]>([]);

  const render = async () => {
    const mm = mermaidRef.current;
    if (!mm) return;
    try {
      setError("");
      const { svg } = await mm.render(`diagram_${renderCount}`, code);
      setRenderCount((c) => c + 1);
      setSvg(svg);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSvg("");
    }
  };

  const generateFromPrompt = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/ai/diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setCode(json.mermaid);
      if (json?.dag) emitAddDiagram({ dag: json.dag, mermaid: json.mermaid });
      // re-render with new code
      setTimeout(render, 0);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setGenerating(false);
    }
  };

  const runAgent = async () => {
    if (!prompt.trim()) return;
    setAgentBusy(true);
    setError("");
    setTrace([]);
    try {
      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`);
      if (json.mermaid) setCode(json.mermaid);
      setTrace(json.trace || []);
      setTimeout(render, 0);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setAgentBusy(false);
    }
  };

  useEffect(() => {
    // auto-render on first load
    if (!svg && mermaidRef.current) render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mermaidRef.current]);

  return (
    <div className="h-full w-full flex flex-col panel">
      <div className="p-3 border-b flex items-center gap-2 divider">
        <h3 className="font-medium">Diagram Panel</h3>
        <div className="flex items-center gap-2 ml-auto">
          <input
            className="border rounded px-2 py-1 text-sm w-56"
            placeholder="Describe the flow to generate…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            className="rounded border px-2 py-1 text-sm"
            onClick={generateFromPrompt}
            disabled={generating || !prompt.trim()}
          >
            {generating ? "Generating…" : "Generate"}
          </button>
          <button
            className="rounded border px-2 py-1 text-sm"
            onClick={runAgent}
            disabled={agentBusy || !prompt.trim()}
          >
            {agentBusy ? "Agent…" : "Agent"}
          </button>
          <button
            className="rounded bg-black text-white px-3 py-1 text-sm"
            onClick={render}
          >
            Render
          </button>
        </div>
      </div>
      <div className="grid grid-rows-2 h-full">
        <textarea
          className="w-full h-full p-3 font-mono text-sm outline-none"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
        />
        <div className="overflow-auto p-3 bg-white space-y-3">
          {error && (
            <pre className="text-red-600 text-sm whitespace-pre-wrap">{error}</pre>
          )}
          <div dangerouslySetInnerHTML={{ __html: svg }} />
          {!!trace.length && (
            <div className="text-xs text-gray-600">
              <div className="font-medium mb-1">Agent trace</div>
              <ul className="list-disc pl-4">
                {trace.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
