export type Dag = {
  nodes: { id: string; label: string; phase?: string }[];
  edges?: { from: string; to: string; label?: string }[];
};

// Returns a list of Excalidraw element skeletons (loosely typed to avoid build-time dependency on internal types)
export function dagToExcalidrawSkeleton(dag: Dag): any[] {
  const xSpacing = 260;
  const ySpacing = 120;

  // Group by phase for simple column layout
  const phases = new Map<string, { id: string; label: string }[]>();
  const ungrouped: { id: string; label: string }[] = [];
  for (const n of dag.nodes) {
    if (n.phase) {
      const arr = phases.get(n.phase) || [];
      arr.push({ id: n.id, label: n.label });
      phases.set(n.phase, arr);
    } else ungrouped.push({ id: n.id, label: n.label });
  }

  const phaseNames = ["Ungrouped", ...Array.from(phases.keys())];
  const columns: { name: string; nodes: { id: string; label: string }[] }[] = [];
  if (ungrouped.length) columns.push({ name: "Ungrouped", nodes: ungrouped });
  for (const [name, nodes] of phases) columns.push({ name, nodes });

  const position: Record<string, { x: number; y: number }> = {};
  const elements: any[] = [];

  columns.forEach((col, colIdx) => {
    col.nodes.forEach((n, rowIdx) => {
      const x = colIdx * xSpacing;
      const y = rowIdx * ySpacing;
      position[n.id] = { x, y };
      elements.push({
        type: "rectangle",
        id: n.id,
        x,
        y,
        width: 200,
        height: 70,
        label: { text: n.label, fontSize: 18 },
      });
    });
  });

  for (const e of dag.edges || []) {
    const fromPos = position[e.from];
    const toPos = position[e.to];
    if (!fromPos || !toPos) continue;
    elements.push({
      type: "arrow",
      x: fromPos.x + 100,
      y: fromPos.y + 35,
      start: { id: e.from },
      end: { id: e.to },
      label: e.label ? { text: e.label } : undefined,
    } as any);
  }

  return elements;
}
