import { NextRequest, NextResponse } from "next/server";
import { fcSearch, type SearchArgs } from "@/lib/ai/tools/firecrawl";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<SearchArgs> | null;
  const hasKey = !!process.env.FIRECRAWL_API_KEY;

  if (!hasKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "FIRECRAWL_API_KEY is not set. Add it to your .env (see .env.example). The Research panel will operate once a key is provided.",
      },
      { status: 503 }
    );
  }

  if (!body?.query || typeof body.query !== "string") {
    return NextResponse.json(
      { ok: false, error: "Missing 'query' string in request body" },
      { status: 400 }
    );
  }

  const args: SearchArgs = {
    query: body.query,
    limit: body.limit ?? 8,
    sources: body.sources ?? ["web", "news"],
    tbs: body.tbs ?? "w",
    location: body.location,
    scrapeOptions: body.scrapeOptions ?? {
      formats: ["markdown"],
      onlyMainContent: true,
      storeInCache: true,
    },
  };

  try {
    const data = await fcSearch(args);
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

