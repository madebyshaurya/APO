"use client";

import { createContext, useContext, useMemo, useState } from "react";

const DEFAULT_MERMAID = `flowchart LR\n  subgraph Plan\n    A[Research] --> B[Outline]\n    B --> C[Plan]\n  end\n  C --> D[Mermaid]\n  D --> E[Canvas]`;

export const MermaidContext = createContext<{
  code: string;
  setCode: (s: string) => void;
} | null>(null);

export function MermaidProvider({ children }: { children: React.ReactNode }) {
  const [code, setCode] = useState<string>(DEFAULT_MERMAID);
  const value = useMemo(() => ({ code, setCode }), [code]);
  return <MermaidContext.Provider value={value}>{children}</MermaidContext.Provider>;
}

export function useMermaidCode() {
  const ctx = useContext(MermaidContext);
  if (!ctx) throw new Error("useMermaidCode must be used within MermaidProvider");
  return ctx;
}

