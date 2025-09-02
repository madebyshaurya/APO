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

