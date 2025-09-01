"use client";

import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false }
);

export default function ExcalidrawComponent() {
  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <Excalidraw />
    </div>
  );
}