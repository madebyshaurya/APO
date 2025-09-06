# Apo – Implementation Status

Updated: 2025-09-05

This document tracks the current state of implementation. It will evolve as work progresses.

Sections:
- Implemented
- Partial / Placeholder
- Not Implemented
- Needs From You

---

## Implemented
- Next.js app bootstrapped (App Router, TS, Tailwind v4).
- Excalidraw canvas renders client-side.
- Workspace shell with right-side panels and top toolbar.
- Mermaid preview panel (client-only) with sample flow and error surfacing.
- Research API surface (POST /api/ai/research) with Firecrawl wrapper.
- Local .env configured with Firecrawl key (Research panel is active).
- .env.example with required variables.
- AI providers: OpenRouter (default) and Google Gemini v2.
  - `OPENROUTER_API_KEY` or `OPENAI_API_KEY` for OpenRouter/OpenAI.
  - `GOOGLE_API_KEY` for Gemini.
  - Diagram API and Assistant endpoints accept `model` including `google/gemini-2.5-flash`.
- Assistant chat bar redesigned (white variant): rounded corners, chips row visible, orange circular send button, model selector includes Gemini.
- Assistant routes:
  - Streaming (`GET /api/ai/assistant/stream`): unified via AI SDK v2 for OpenAI/OpenRouter and Gemini — true token streaming + tool-calling.
  - Tools: `web_search`, `write_mermaid`, and new `draw_excalidraw` that inserts boxes/arrows directly into the Excalidraw canvas (via SSE `excalidraw`).
  - Non‑streaming (`POST /api/ai/assistant`): still supported; streaming is the default UX.
  - Prompt tuned: fewer constraints; the model freely chooses layout and which tool to use, with optional layout hints supported.
  - Canvas context: client computes a compact `CanvasSummary` and uploads it to `/api/canvas/summary`. Streaming accepts `?ctx=<id>` and exposes tools: `read_canvas()` and `search_canvas({ query, limit? })`.
- When the assistant generates a DAG, the app auto-inserts nodes and arrows onto the Excalidraw board (simple column layout grouped by phase). Mermaid preview also updates.

## Partial / Placeholder
- ResearchPanel UI: basic form (query, sources, tbs, markdown toggle) and result list. If no API key is set, shows helpful guidance.
- Diagram generation via AI SDK (OpenRouter): route implemented; requires `OPENROUTER_API_KEY` or `OPENAI_API_KEY`. Assistant supports tool calling; LangGraph remains backend-only.
 - Auto-layout for `draw_excalidraw` uses BFS levels from a likely root and wraps within a level (maxPerRow) to avoid ultra-wide rows; future upgrade: Dagre/ELK for nicer routing.
- Collab: placeholders for EXCALIDRAW_ROOM_URL; no real-time sync yet.
- Persistence: no DB; stubs left for future Supabase integration.

## Not Implemented (planned per README)
- Supabase Auth, projects/boards, snapshots.
- Realtime presence/chat.
- Firecrawl /v2/crawl and /v2/extract flows and webhook ingest.
- Vector embeddings and search in Postgres/pgvector.
- LangGraph graphs (deepResearch, planToDiagram, pmfCompare).
- Excalidraw asset management (icons/images) and nicer layout/autorouting.
- Inspiration surfacer and PMF competitor matrix UI.
- Rate limiting, Langfuse/Helicone observability, deployments.

## Needs From You
- FIRECRAWL_API_KEY: obtain from Firecrawl and add to your local .env.
- OPENROUTER_API_KEY: create at openrouter.ai and set in `.env` (optional: `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME`). You can continue to use `OPENAI_API_KEY` as a fallback.
- GOOGLE_API_KEY: add if you want to use Gemini (`google/gemini-2.5-flash`).
- Decision: Collab transport for MVP — proceed with excalidraw-room (recommended) or target Yjs/Hocuspocus. Provide the room server URL if running one.
- Supabase project details (if proceeding next): project URL, anon key, schema decisions (we have a sketch), and bucket setup for assets.
- Branding/product decisions: default org/project naming, any initial example projects to seed.

## Next Suggested Steps
1) Wire Supabase Auth + minimal "boards" table; persist board snapshots.
2) Add excalidraw-room live collaboration.
3) Improve Excalidraw layout (Dagre/ELK), add icons/images to nodes, and edge autorouting.
4) Expand research to ingest + display citations and allow dragging references to canvas.
5) Upgrade Excalidraw layout (Dagre/ELK), edge routing, and theme-aware node styles for the draw tool.
6) Add embeddings-based `search_canvas` for semantic matches (optional)

## Known Issues / Troubleshooting
- Runtime TypeError: Cannot read properties of undefined (reading 'call') — Next.js 15.5.2 (Webpack)
  - Typically due to stale `.next/` cache or conflicting root lockfile.
  - Fix: stop dev server, `npm run clean && npm run dev`. Ensure only one `package-lock.json` in this workspace. We also pin the dev root (`next.config.js`), and our `predev` script clears `.next/` and bootstraps the manifest.
