"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { ADD_DIAGRAM_EVENT, ADD_EXCALIDRAW_EVENT } from "@/lib/board/events";
import { dagToExcalidrawSkeleton } from "@/lib/board/dagToExcalidraw";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false }
);

export default function ExcalidrawComponent() {
  const apiRef = useRef<any>(null);

  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const mod = await import("@excalidraw/excalidraw");
      const { convertToExcalidrawElements } = mod as any;
      // Expose a compact canvas summary getter for the assistant
      const buildSummary = () => {
        try {
          if (!apiRef.current) return null;
          const els = apiRef.current.getSceneElements() || [];
          const nodes: any[] = [];
          const edges: any[] = [];
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          const clampText = (s?: string) => (s || "").slice(0, 120);
          for (const e of els) {
            minX = Math.min(minX, e.x || 0); minY = Math.min(minY, e.y || 0);
            maxX = Math.max(maxX, (e.x || 0) + (e.width || 0));
            maxY = Math.max(maxY, (e.y || 0) + (e.height || 0));
            if (e.type === "arrow") {
              const startId = (e as any).start?.boundElementId || (e as any).start?.elementId || (e as any).start?.id;
              const endId = (e as any).end?.boundElementId || (e as any).end?.elementId || (e as any).end?.id;
              if (startId && endId) edges.push({ from: startId, to: endId, label: clampText((e as any).label?.text) });
            } else if (e.type === "rectangle" || e.type === "text") {
              nodes.push({ id: e.id, text: clampText((e as any).label?.text || (e as any).text), type: e.type === "text" ? "text" : "box", x: Math.round(e.x || 0), y: Math.round(e.y || 0), w: Math.round(e.width || 0), h: Math.round(e.height || 0) });
            }
          }
          const bounds = Number.isFinite(minX) ? [minX, minY, maxX, maxY] : undefined;
          const hash = (nodes.map(n => n.id + ":" + (n.text||"")).join("|") + "#" + edges.map(ed => ed.from+">"+ed.to).join(",")).slice(0,64);
          return { stats: { nodes: nodes.length, edges: edges.length, bounds }, nodes, edges, hash };
        } catch { return null; }
      };
      (window as any).apoGetCanvasSummary = buildSummary;
      const handler = (ev: any) => {
        try {
          const dag = ev?.detail?.dag;
          if (!dag || !apiRef.current || !convertToExcalidrawElements) return;
          const skeleton = dagToExcalidrawSkeleton(dag);
          const elements = convertToExcalidrawElements(skeleton, { regenerateIds: false });
          const current = apiRef.current.getSceneElements() || [];
          apiRef.current.updateScene({ elements: [...current, ...elements] });
        } catch {}
      };
      const handler2 = (ev: any) => {
        try {
          const els = ev?.detail?.elements;
          if (!els || !apiRef.current || !convertToExcalidrawElements) return;
          const elements = convertToExcalidrawElements(els, { regenerateIds: false });
          const current = apiRef.current.getSceneElements() || [];
          apiRef.current.updateScene({ elements: [...current, ...elements] });
        } catch {}
      };
      window.addEventListener(ADD_DIAGRAM_EVENT, handler as any);
      window.addEventListener(ADD_EXCALIDRAW_EVENT, handler2 as any);
      cleanup = () => {
        window.removeEventListener(ADD_DIAGRAM_EVENT, handler as any);
        window.removeEventListener(ADD_EXCALIDRAW_EVENT, handler2 as any);
      };
    })();
    return () => cleanup();
  }, []);

  return (
    <div style={{ height: "100%", width: "100%", position: "absolute", inset: 0 }}>
      <Excalidraw excalidrawAPI={(api: any) => (apiRef.current = api)} />
    </div>
  );
}
