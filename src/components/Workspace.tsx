"use client";

import { useState } from "react";
import ExcalidrawComponent from "./ExcalidrawComponent";
import DiagramPanel from "./panels/DiagramPanel";
import { MermaidProvider } from "./mermaid/MermaidContext";
import { AnimatePresence, motion } from "framer-motion";
import AssistantInput from "./AssistantInput";

export default function Workspace() {
  const [panel, setPanel] = useState<"diagram" | null>(null);
  const panelWidth = 380;

  return (
    <MermaidProvider>
      <div className="h-screen w-screen overflow-hidden flex flex-col">
        {/* Top bar */}
        <div className="h-10 toolbar flex items-center px-2 gap-2">
          <div className="font-semibold text-sm">Apo</div>
        </div>

        {/* Body: canvas + panel */}
        <div className="relative flex-1">
          {/* Canvas */}
          <div className="absolute inset-0">
            <ExcalidrawComponent />
          </div>

          {/* Right panel: animated presence */}
          <AnimatePresence>
            {panel && (
              <motion.div
                key={panel}
                initial={{ width: 0, opacity: 0.0, x: 12 }}
                animate={{ width: panelWidth, opacity: 1, x: 0 }}
                exit={{ width: 0, opacity: 0, x: 12 }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                className="panel border-l absolute top-0 right-0 h-full overflow-hidden z-30 shadow-sm"
                style={{ width: panelWidth }}
              >
                <DiagramPanel />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom assistant input */}
          <AssistantInput onOpenDiagram={() => setPanel("diagram")} />
        </div>
      </div>
    </MermaidProvider>
  );
}

