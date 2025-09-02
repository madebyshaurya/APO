export type Dag = {
  nodes: { id: string; label: string; phase?: string }[];
  edges?: { from: string; to: string; label?: string }[];
};

export function dagToMermaid(dag: Dag): string {
  const lines: string[] = ["flowchart LR"];

  const byPhase = new Map<string, { id: string; label: string }[]>();
  for (const n of dag.nodes) {
    if (n.phase) {
      const arr = byPhase.get(n.phase) || [];
      arr.push({ id: n.id, label: n.label });
      byPhase.set(n.phase, arr);
    } else {
      lines.push(`  ${n.id}["${escapeText(n.label)}"]`);
    }
  }

  for (const [phase, nodes] of byPhase) {
    lines.push(`  subgraph ${sanitizeId(phase)}`);
    for (const n of nodes) lines.push(`    ${n.id}["${escapeText(n.label)}"]`);
    lines.push("  end");
  }

  for (const e of dag.edges || []) {
    const lbl = e.label ? `|${escapeText(e.label)}|` : "";
    lines.push(`  ${e.from} -->${lbl} ${e.to}`);
  }

  return lines.join("\n");
}

function sanitizeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeText(s: string) {
  return s.replace(/"/g, "'");
}

