import { z } from "zod";

export const DagSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        phase: z.string().optional(),
      })
    )
    .min(1),
  edges: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        label: z.string().optional(),
      })
    )
    .optional()
    .default([]),
});

export type Dag = z.infer<typeof DagSchema>;

// Excalidraw JSON draw spec the AI will produce via tool-calling
export const ExSpecSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        kind: z.enum(["box", "text"]).optional().default("box"),
        width: z.number().optional(),
        height: z.number().optional(),
        phase: z.string().optional(),
      })
    )
    .min(1),
  edges: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        label: z.string().optional(),
        curved: z.boolean().optional(),
      })
    )
    .optional()
    .default([]),
  layout: z
    .object({
      direction: z.enum(["TB", "LR"]).optional().default("TB"),
      gapX: z.number().optional().default(180),
      gapY: z.number().optional().default(130),
      maxPerRow: z.number().int().positive().optional().default(4),
    })
    .optional(),
  style: z
    .object({
      roundness: z.number().optional().default(0.2),
      roughness: z.number().optional().default(1.6),
    })
    .optional(),
});

export type ExSpec = z.infer<typeof ExSpecSchema>;

// Lightweight canvas summary supplied by the client and used by tools
export const CanvasSummarySchema = z.object({
  // Digest scope used to keep payloads small
  scope: z.enum(["selection", "viewport", "all"]).optional(),
  // Lightweight stats (no pixels/points). Only counts.
  stats: z
    .object({
      nodes: z.number().optional(),
      edges: z.number().optional(),
      bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      images: z.number().optional(),
      freedraw: z.number().optional(),
    })
    .optional(),
  // Selected element ids (if any)
  selection: z.array(z.string()).optional(),
  // Text-bearing items only (sticky notes, text boxes, labeled boxes)
  nodes: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().optional().default(""),
        type: z.string().optional().default("box"),
        x: z.number().optional(),
        y: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
      })
    )
    .default([]),
  // Connections (arrows) between ids with optional label
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
      })
    )
    .default([]),
  // User-provided attachments (trimmed): limited text content only
  attachments: z
    .array(
      z.object({ name: z.string(), text: z.string().optional().default("") })
    )
    .optional(),
  // Optional detail index for on-demand lookup
  details: z
    .record(
      z.object({
        text: z.string().optional().default(""),
        x: z.number().optional(),
        y: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
        type: z.string().optional(),
      })
    )
    .optional(),
  hash: z.string().optional(),
});
export type CanvasSummary = z.infer<typeof CanvasSummarySchema>;
