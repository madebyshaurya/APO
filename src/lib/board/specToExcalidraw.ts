import { ExSpec } from "@/lib/ai/schemas";

// Convert an ExSpec (nodes + edges + optional layout) to Excalidraw element skeletons
export function specToExcalidrawSkeleton(spec: ExSpec): any[] {
  const gapX = spec.layout?.gapX ?? 180;
  const gapY = spec.layout?.gapY ?? 130;
  const direction = spec.layout?.direction ?? "TB"; // TB: top-bottom; LR: left-right
  const maxPerRow = spec.layout?.maxPerRow ?? 4;

  const nodes = spec.nodes || [];
  const edges = spec.edges || [];
  if (nodes.length === 0) return [];

  // Build adjacency and degrees
  const indeg: Record<string, number> = {};
  const outdeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const n of nodes) {
    indeg[n.id] = 0; outdeg[n.id] = 0; adj[n.id] = [];
  }
  for (const e of edges) {
    if (adj[e.from]) adj[e.from].push(e.to);
    if (outdeg[e.from] !== undefined) outdeg[e.from]++;
    if (indeg[e.to] !== undefined) indeg[e.to]++;
  }

  // Choose a root: indegree 0 with highest outdegree; fallback first node
  let roots = nodes.filter(n => indeg[n.id] === 0);
  if (roots.length === 0) roots = [nodes[0]];
  roots.sort((a,b) => (outdeg[b.id]||0) - (outdeg[a.id]||0));
  const start = roots[0];

  // BFS to assign levels
  const level: Record<string, number> = {};
  const q: string[] = [];
  q.push(start.id); level[start.id] = 0;
  while (q.length) {
    const u = q.shift()!;
    for (const v of adj[u] || []) if (level[v] === undefined) { level[v] = level[u] + 1; q.push(v); }
  }
  // Any unvisited nodes: place after deepest level preserving indeg 0 first
  const maxLevel = Math.max(0, ...Object.values(level));
  for (const n of nodes) if (level[n.id] === undefined) level[n.id] = maxLevel + 1;

  // Bucket nodes by level
  const buckets: Record<number, string[]> = {};
  for (const n of nodes) {
    const lv = level[n.id] ?? 0;
    buckets[lv] = buckets[lv] || [];
    buckets[lv].push(n.id);
  }
  // Sort each bucket by outdegree desc for nicer spread
  for (const k of Object.keys(buckets)) buckets[+k].sort((a,b) => (outdeg[b]||0)-(outdeg[a]||0));

  const pos: Record<string, { x: number; y: number }> = {};
  const elements: any[] = [];

  const levels = Object.keys(buckets).map(n => +n).sort((a,b)=>a-b);
  for (const li of levels) {
    const ids = buckets[li];
    const cols = Math.min(maxPerRow, Math.max(1, Math.ceil(Math.sqrt(ids.length))));
    const perRow = Math.max(1, Math.min(maxPerRow, Math.ceil(ids.length / Math.ceil(ids.length/cols))));
    const rows = Math.ceil(ids.length / perRow);
    const localWidth = (perRow - 1) * gapX;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const node = nodes.find(n => n.id === id)!;
      const r = Math.floor(i / perRow);
      const c = i % perRow;
      const baseX = -localWidth / 2; // center around 0
      const xTB = baseX + c * gapX;
      const yTB = li * gapY + r * (gapY * 0.8);
      const x = direction === "TB" ? xTB : li * gapX + r * (gapX * 0.8);
      const y = direction === "TB" ? yTB : baseX + c * gapY;

      pos[id] = { x, y };

      const est = estimateSize(node.label, node.width, node.height);
      if ((node.kind || "box") === "box") {
        elements.push({ type: "rectangle", id, x, y, width: est.width, height: est.height, label: { text: node.label, fontSize: 18 } });
      } else {
        elements.push({ type: "text", id, x, y, label: { text: node.label, fontSize: 18 } });
      }
    }
  }

  for (const e of edges) {
    const a = pos[e.from];
    const b = pos[e.to];
    if (!a || !b) continue;
    elements.push({ type: "arrow", x: a.x + 100, y: a.y + 35, start: { id: e.from }, end: { id: e.to }, label: e.label ? { text: e.label } : undefined } as any);
  }

  return elements;
}

function estimateSize(label: string, width?: number, height?: number) {
  if (width || height) return { width: width || 200, height: height || 70 };
  const len = (label || "").length;
  const w = Math.max(160, Math.min(320, 16 * Math.min(20, Math.ceil(len / 1.8))));
  const h = 70;
  return { width: w, height: h };
}
