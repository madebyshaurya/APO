"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { ADD_DIAGRAM_EVENT, ADD_EXCALIDRAW_EVENT, PATCH_EXCALIDRAW_EVENT } from "@/lib/board/events";
import { dagToExcalidrawSkeleton } from "@/lib/board/dagToExcalidraw";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false }
);

export default function ExcalidrawComponent() {
  const apiRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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
          const appState = apiRef.current.getAppState?.() || {};

          const selectedMap = (appState as any).selectedElementIds || {};
          const selection: string[] = Object.keys(selectedMap).filter((k) => selectedMap[k]);

          // Compute viewport in scene coords
          const zoom = (appState as any)?.zoom?.value || 1;
          const scrollX = (appState as any)?.scrollX || 0;
          const scrollY = (appState as any)?.scrollY || 0;
          const rect = containerRef.current?.getBoundingClientRect?.();
          const vpLeft = rect ? -scrollX / zoom : -Infinity;
          const vpTop = rect ? -scrollY / zoom : -Infinity;
          const vpWidth = rect ? rect.width / zoom : Infinity;
          const vpHeight = rect ? rect.height / zoom : Infinity;
          const vpRight = vpLeft + vpWidth;
          const vpBottom = vpTop + vpHeight;
          const intersects = (x:number, y:number, w:number, h:number) => !(x > vpRight || y > vpBottom || (x + w) < vpLeft || (y + h) < vpTop);

          // Decide scope: selection > viewport (if rect present) > all
          let scope: "selection" | "viewport" | "all" = "all";
          const includedIds = new Set<string>();
          if (selection.length > 0) {
            scope = "selection";
            selection.forEach((id) => includedIds.add(id));
          } else if (rect) {
            scope = "viewport";
            for (const e of els) {
              const x = Math.round((e as any).x || 0);
              const y = Math.round((e as any).y || 0);
              const w = Math.round((e as any).width || 0);
              const h = Math.round((e as any).height || 0);
              if (intersects(x, y, w, h)) includedIds.add((e as any).id);
            }
          } else {
            scope = "all";
            for (const e of els) includedIds.add((e as any).id);
          }

          // Build digest
          const nodes: any[] = [];
          const edges: any[] = [];
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          let images = 0, freedraw = 0;
          const clampText = (s?: string) => (s || "").slice(0, 200);
          const details: Record<string, any> = {};

          // First pass: count noisy types and compute bounds on included text-bearing items
          const allowedBoxTypes = new Set(["rectangle", "diamond", "ellipse"]);
          for (const e of els) {
            const type = (e as any).type;
            if (type === "image") images++;
            if (type === "freedraw") freedraw++;

            if (!includedIds.has((e as any).id)) continue;

            if (type === "text" || allowedBoxTypes.has(type)) {
              const fullText = (e as any).label?.text || (e as any).text || "";
              const text = clampText(fullText);
              if (!text) continue; // text-only
              const x = Math.round((e as any).x || 0);
              const y = Math.round((e as any).y || 0);
              const w = Math.round((e as any).width || 0);
              const h = Math.round((e as any).height || 0);
              nodes.push({ id: (e as any).id, text, type: type === "text" ? "text" : "box", x, y, w, h });
              details[(e as any).id] = { text: fullText, x, y, w, h, type };
              minX = Math.min(minX, x); minY = Math.min(minY, y);
              maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
            }
          }

          // Build edges only if both endpoints are among included text nodes
          const includedNodeIds = new Set(nodes.map((n) => n.id));
          for (const e of els) {
            if ((e as any).type !== "arrow") continue;
            if (!includedIds.has((e as any).id)) continue; // keep edge if in scope
            const startId = (e as any).start?.boundElementId || (e as any).start?.elementId || (e as any).start?.id;
            const endId = (e as any).end?.boundElementId || (e as any).end?.elementId || (e as any).end?.id;
            if (startId && endId && includedNodeIds.has(startId) && includedNodeIds.has(endId)) {
              edges.push({ from: startId, to: endId, label: clampText((e as any).label?.text) });
            }
          }

          const bounds = Number.isFinite(minX) ? [minX, minY, maxX, maxY] : undefined;
          const hash = (nodes.map(n => n.id + ":" + (n.text||"")).join("|") + "#" + edges.map(ed => ed.from+">"+ed.to).join(",")).slice(0,64);

          return { scope, stats: { nodes: nodes.length, edges: edges.length, bounds, images, freedraw }, selection, nodes, edges, details, hash };
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
      const handlerPatch = (ev: any) => {
        try {
          if (!apiRef.current) return;
          const detail = ev?.detail || {};
          const current = (apiRef.current.getSceneElements() || []).map((e: any) => ({ ...e }));
          const byId = new Map(current.map((e: any) => [e.id, e]));
          let elements = current;

          // Connect: create new arrows between ids (avoid duplicates)
          const connects: { from: string; to: string; label?: string }[] = Array.isArray(detail?.connect) ? detail.connect : [];
          if (connects.length && convertToExcalidrawElements) {
            const newArrows = connects.map((c) => ({ type: "arrow", start: { id: c.from }, end: { id: c.to }, label: c.label ? { text: c.label } : undefined }));
            const els = convertToExcalidrawElements(newArrows, { regenerateIds: false });
            elements = [...elements, ...els];
          }

          // Update: change text/position/size when ids exist
          const updates: any[] = Array.isArray(detail?.update) ? detail.update : [];
          if (updates.length) {
            const toUpdate = new Map(updates.map((u) => [u.id, u]));
            elements = elements.map((e: any) => {
              const u = toUpdate.get(e.id);
              if (!u) return e;
              const copy: any = { ...e };
              if (typeof u.x === "number") copy.x = u.x;
              if (typeof u.y === "number") copy.y = u.y;
              if (typeof u.w === "number") copy.width = u.w;
              if (typeof u.h === "number") copy.height = u.h;
              if (typeof u.text === "string") {
                if (copy.type === "text") copy.text = u.text;
                else copy.label = { ...(copy.label || {}), text: u.text };
              }
              return copy;
            });
          }

          // Remove elements by id
          const removeIds: string[] = Array.isArray(detail?.remove) ? detail.remove : [];
          if (removeIds.length) {
            const drop = new Set(removeIds);
            elements = elements.filter((e: any) => !drop.has(e.id));
          }

          // Raw add
          const addRaw: any[] = Array.isArray(detail?.add) ? detail.add : [];
          if (addRaw.length && convertToExcalidrawElements) {
            const els = convertToExcalidrawElements(addRaw, { regenerateIds: false });
            elements = [...elements, ...els];
          }

          apiRef.current.updateScene({ elements });
        } catch {}
      };
      window.addEventListener(ADD_DIAGRAM_EVENT, handler as any);
      window.addEventListener(ADD_EXCALIDRAW_EVENT, handler2 as any);
      window.addEventListener(PATCH_EXCALIDRAW_EVENT, handlerPatch as any);
      cleanup = () => {
        window.removeEventListener(ADD_DIAGRAM_EVENT, handler as any);
        window.removeEventListener(ADD_EXCALIDRAW_EVENT, handler2 as any);
        window.removeEventListener(PATCH_EXCALIDRAW_EVENT, handlerPatch as any);
      };
    })();
    return () => cleanup();
  }, []);

  return (
    <div ref={containerRef} style={{ height: "100%", width: "100%", position: "absolute", inset: 0 }}>
      <Excalidraw excalidrawAPI={(api: any) => (apiRef.current = api)} />
    </div>
  );
}
