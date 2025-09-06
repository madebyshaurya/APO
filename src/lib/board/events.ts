export type AddDiagramDetail = {
  dag: { nodes: { id: string; label: string; phase?: string }[]; edges?: { from: string; to: string; label?: string }[] };
  mermaid?: string;
};

export const ADD_DIAGRAM_EVENT = "apo:addDiagram";
export const ADD_EXCALIDRAW_EVENT = "apo:addExcalidraw";
export const PATCH_EXCALIDRAW_EVENT = "apo:patchExcalidraw";

export function emitAddDiagram(detail: AddDiagramDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADD_DIAGRAM_EVENT, { detail }));
}

export type AddExcalidrawDetail = { elements: any[] };
export function emitAddExcalidraw(detail: AddExcalidrawDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADD_EXCALIDRAW_EVENT, { detail }));
}

export type PatchExcalidrawDetail = {
  // Add connectors: convenience for creating arrows by element ids
  connect?: { from: string; to: string; label?: string }[];
  // Updates: modify text/position/size for existing elements
  update?: { id: string; text?: string; x?: number; y?: number; w?: number; h?: number }[];
  // Remove elements by id
  remove?: string[];
  // Optional low-level elements to add (same shape as in emitAddExcalidraw)
  add?: any[];
};
export function emitPatchExcalidraw(detail: PatchExcalidrawDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PATCH_EXCALIDRAW_EVENT, { detail }));
}
