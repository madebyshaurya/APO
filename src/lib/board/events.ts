export type AddDiagramDetail = {
  dag: { nodes: { id: string; label: string; phase?: string }[]; edges?: { from: string; to: string; label?: string }[] };
  mermaid?: string;
};

export const ADD_DIAGRAM_EVENT = "apo:addDiagram";
export const ADD_EXCALIDRAW_EVENT = "apo:addExcalidraw";

export function emitAddDiagram(detail: AddDiagramDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADD_DIAGRAM_EVENT, { detail }));
}

export type AddExcalidrawDetail = { elements: any[] };
export function emitAddExcalidraw(detail: AddExcalidrawDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADD_EXCALIDRAW_EVENT, { detail }));
}
