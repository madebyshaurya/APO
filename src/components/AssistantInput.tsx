"use client";

import { useRef, useState } from "react";
import { useMermaidCode } from "./mermaid/MermaidContext";
import { emitAddDiagram, emitAddExcalidraw } from "@/lib/board/events";

export default function AssistantInput({ onOpenDiagram }: { onOpenDiagram?: () => void }) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [last, setLast] = useState<string>("");
  const [model, setModel] = useState<string>(process.env.NEXT_PUBLIC_DEFAULT_MODEL || "openai/gpt-4o-mini");
  const [attachments, setAttachments] = useState<{ name: string; text: string }[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const { setCode } = useMermaidCode();
  const [ctxId, setCtxId] = useState<string | null>(null);

  const send = async () => {
    const prompt = value.trim();
    if (!prompt || loading) return;
    setLoading(true);
    setError("");
    setLast("");

    // Prefer streaming via SSE
    try {
      if (attachments.length === 0) {
        // Prepare canvas summary context (if available)
        try {
          const summary = (window as any).apoGetCanvasSummary?.();
          if (summary) {
            const res = await fetch("/api/canvas/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ summary }) });
            const json = await res.json();
            if (res.ok && json?.ok && json?.id) setCtxId(json.id);
          }
        } catch {}
        // Use streaming when no file attachments
        const url = `/api/ai/assistant/stream?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(model)}${ctxId ? `&ctx=${encodeURIComponent(ctxId)}` : ""}`;
        const es = new EventSource(url);
        es.addEventListener("log", (ev: any) => {
          const data = safeParse(ev.data);
          setLast((prev) => (prev ? prev + "\n" : "") + (data?.message || ""));
        });
        es.addEventListener("text", (ev: any) => {
          const data = safeParse(ev.data);
          setLast((prev) => (prev || "") + (data?.chunk || ""));
        });
        es.addEventListener("mermaid", (ev: any) => {
          const data = safeParse(ev.data);
          if (data?.code) {
            setCode(data.code);
            if (data?.dag) emitAddDiagram({ dag: data.dag, mermaid: data.code });
            onOpenDiagram?.();
          }
        });
        es.addEventListener("excalidraw", (ev: any) => {
          const data = safeParse(ev.data);
          if (Array.isArray(data?.elements)) {
            emitAddExcalidraw({ elements: data.elements });
          }
        });
        es.addEventListener("error", (ev: any) => {
          const data = safeParse(ev.data);
          setError(data?.message || "Error");
        });
        es.addEventListener("done", () => {
          es.close();
          setLoading(false);
        });
        return; // don't fall through to POST
      }
      // If there are files, use non-streaming POST
      try {
        const res = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, model, files: attachments }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`);
        setLast(json.text || "");
        if (json.mermaid) {
          setCode(json.mermaid);
          if (json?.dag) emitAddDiagram({ dag: json.dag, mermaid: json.mermaid });
          onOpenDiagram?.();
        }
      } catch (e2: any) {
        setError(e2?.message ?? String(e2));
      } finally {
        setLoading(false);
      }
    } finally {
      setValue("");
      setAttachments([]);
    }
  };

  const safeParse = (t: string) => {
    try { return JSON.parse(t); } catch { return {}; }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    const list: { name: string; text: string }[] = [];
    for (let i = 0; i < Math.min(files.length, 4); i++) {
      const f = files[i];
      try {
        const text = await f.text();
        list.push({ name: f.name, text: text.slice(0, 12000) });
      } catch {}
    }
    setAttachments((prev) => [...prev, ...list]);
  };

  return (
    <div className="pointer-events-none select-none absolute left-0 right-0 bottom-4 flex justify-center z-40">
      <div className="relative w-[min(860px,94vw)] pointer-events-auto">
      <div className="group w-full rounded-2xl bg-white border shadow-sm transition-all chat-composer">
        {/* Top row: input + send */}
        <div className="flex items-center gap-2 px-4 py-3">
          <input
            className="flex-1 outline-none text-sm placeholder:text-gray-500"
            placeholder="Ask a follow-up question"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            maxLength={3000}
          />
          <button
            onClick={send}
            disabled={!value.trim() || loading}
            className="w-8 h-8 rounded-full text-white flex items-center justify-center shadow-sm disabled:opacity-50"
            style={{ background: loading ? "#9CA3AF" : "linear-gradient(180deg,#FFA24A,#FF6A00)" }}
            title="Send"
          >
            {loading ? "…" : "↑"}
          </button>
        </div>

        {/* Bottom row: chips (show on hover/focus) */}
        <div className="hidden group-hover:flex group-focus-within:flex items-center justify-between text-[12px] text-gray-700 border-t px-4 py-2 rounded-b-2xl">
          <div className="flex items-center gap-2">
            <button
              className="h-6 w-6 rounded-full border flex items-center justify-center text-gray-700 hover:bg-gray-50"
              onClick={() => fileInput.current?.click()}
              title="Add"
            >
              +
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => onPickFiles(e.target.files)}
            />
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 rounded-full border bg-white">🌐 Web search</span>
              <span className="px-2 py-1 rounded-full border bg-white">💡 Research ×</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="text-xs border rounded-full px-2 py-1 bg-white"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
              <option value="openai/gpt-4o">openai/gpt-4o</option>
              <option value="google/gemini-2.5-flash">google/gemini-2.5-flash</option>
            </select>
            <div className="text-gray-500">{value.length} / 3,000</div>
          </div>
        </div>
      </div>
      {/* Streaming output bubble, aligned to composer width */}
      {(last || error) && (
        <div
          className="absolute left-0 right-0 text-sm text-gray-800 bg-white border rounded-xl px-4 py-3 shadow-md whitespace-pre-wrap overflow-auto"
          style={{ bottom: "calc(100% + 10px)", maxHeight: 220 }}
        >
          {error ? <span className="text-red-600">{error}</span> : last}
        </div>
      )}
      </div>
    </div>
  );
}
