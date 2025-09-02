"use client";

import { useCallback, useState } from "react";
import { useMermaidCode } from "../mermaid/MermaidContext";

type Result = {
  url: string;
  title?: string;
  favicon?: string;
  snippet?: string;
};

export default function ResearchPanel({ onOpenPanel }: { onOpenPanel?: (p: "research" | "diagram") => void }) {
  const [query, setQuery] = useState("");
  const [tbs, setTbs] = useState("w");
  const [sources, setSources] = useState<string[]>(["web", "news"]);
  const [scrape, setScrape] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [results, setResults] = useState<Result[]>([]);
  const { setCode } = useMermaidCode();

  const toggleSource = (src: string) => {
    setSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]
    );
  };

  const run = useCallback(async () => {
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const res = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          tbs,
          sources,
          scrapeOptions: scrape
            ? { formats: ["markdown"], onlyMainContent: true, storeInCache: true }
            : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      // Normalize a small subset to display
      const hits: Result[] = [];
      const groups = json.data?.results || json.data?.data || json.data; // forgiving shape
      const all = [
        ...(groups?.web || []),
        ...(groups?.news || []),
        ...(Array.isArray(groups) ? groups : []),
      ];
      for (const it of all) {
        if (it?.url) hits.push({ url: it.url, title: it.title, snippet: it.snippet, favicon: it.favicon });
      }
      setResults(hits);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [query, tbs, sources, scrape]);

  const generateFlow = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/research-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, tbs, sources, limit: 6, scrapeOptions: scrape ? { formats: ["markdown"], onlyMainContent: true, storeInCache: true } : undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setCode(json.mermaid);
      onOpenPanel?.("diagram");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [query, tbs, sources, scrape, onOpenPanel, setCode]);

  return (
    <div className="h-full w-full flex flex-col panel">
      <div className="p-3 border-b divider">
        <h3 className="font-medium">Research Panel</h3>
      </div>
      <div className="p-3 space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What are you researching?"
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={sources.includes("web")} onChange={() => toggleSource("web")} /> Web
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={sources.includes("news")} onChange={() => toggleSource("news")} /> News
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={scrape} onChange={() => setScrape((s) => !s)} /> Scrape markdown
          </label>
          <select value={tbs} onChange={(e) => setTbs(e.target.value)} className="border rounded px-2 py-1">
            <option value="d">past day</option>
            <option value="w">past week</option>
            <option value="m">past month</option>
            <option value="y">past year</option>
          </select>
          <button
            className="ml-auto rounded bg-black text-white px-3 py-1 text-sm"
            onClick={run}
            disabled={!query || loading}
          >
            {loading ? "Searching…" : "Search"}
          </button>
          <button
            className="rounded border px-3 py-1 text-sm"
            onClick={generateFlow}
            disabled={!query || loading}
          >
            Generate Flow
          </button>
        </div>
        {error && (
          <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2 whitespace-pre-wrap">
            {error}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto divide-y">
        {results.map((r) => (
          <a key={r.url} className="block p-3 hover:bg-gray-50" href={r.url} target="_blank" rel="noreferrer">
            <div className="text-sm font-medium truncate">{r.title || r.url}</div>
            {r.snippet && <div className="text-xs text-gray-600 line-clamp-2">{r.snippet}</div>}
          </a>
        ))}
        {!results.length && !loading && !error && (
          <div className="p-3 text-sm text-gray-600">Enter a query and click Search to see results.</div>
        )}
      </div>
    </div>
  );
}

