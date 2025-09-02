"use client";

import { useState } from "react";
import { useMermaidCode } from "./mermaid/MermaidContext";

export default function AssistantInput({ onOpenDiagram }: { onOpenDiagram?: () => void }) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [last, setLast] = useState<string>("");
  const { setCode } = useMermaidCode();

  const send = async () => {
    const prompt = value.trim();
    if (!prompt || loading) return;
    setLoading(true);
    setError("");
    setLast("");

    // Prefer streaming via SSE
    try {
      const url = `/api/ai/assistant/stream?prompt=${encodeURIComponent(prompt)}`;
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
          onOpenDiagram?.();
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
    } catch (e: any) {
      // Fallback to non-streaming POST
      try {
        const res = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`);
        setLast(json.text || "");
        if (json.mermaid) {
          setCode(json.mermaid);
          onOpenDiagram?.();
        }
      } catch (e2: any) {
        setError(e2?.message ?? String(e2));
      } finally {
        setLoading(false);
      }
    } finally {
      setValue("");
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

  return (
    <div className="pointer-events-none select-none absolute left-0 right-0 bottom-4 flex justify-center z-40">
      <div className="pointer-events-auto w-[min(760px,92vw)] rounded-full bg-white border shadow-sm flex items-center gap-2 px-3 py-2">
        <input
          className="flex-1 outline-none text-sm"
          placeholder="Ask Apo…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
        />
        <button
          onClick={send}
          disabled={!value.trim() || loading}
          className="rounded-full px-3 py-1 text-sm text-white"
          style={{ background: loading ? "#9CA3AF" : "#111318" }}
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
      {/* Minimal ephemeral message */}
      {(last || error) && (
        <div className="absolute bottom-14 w-[min(760px,92vw)] text-xs text-gray-600 bg-white/90 border rounded px-3 py-2 shadow-sm whitespace-pre-wrap">
          {error ? <span className="text-red-600">{error}</span> : last}
        </div>
      )}
    </div>
  );
}

