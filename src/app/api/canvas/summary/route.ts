import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CanvasSummarySchema } from "@/lib/ai/schemas";
import { putContext } from "@/lib/runtime/contextStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({ id: z.string().optional(), summary: CanvasSummarySchema });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, summary } = BodySchema.parse(body);
    const ctxId = id || crypto.randomUUID();
    putContext(ctxId, summary);
    return NextResponse.json({ ok: true, id: ctxId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 400 });
  }
}

