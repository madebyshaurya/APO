# Apo – Implementation Status

Updated: 2025-09-01

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
- Local .env configured with OpenAI key (AI diagram generation is active; default model gpt-4o-mini).

## Partial / Placeholder
- ResearchPanel UI: basic form (query, sources, tbs, markdown toggle) and result list. If no API key is set, shows helpful guidance.
- Diagram generation via AI SDK: route implemented; requires OPENAI_API_KEY (or compatible) to be set. Added single-input assistant using AI SDK tool calling (no manual tool selection). LangGraph code is no longer used in the UI.
- Collab: placeholders for EXCALIDRAW_ROOM_URL; no real-time sync yet.
- Persistence: no DB; stubs left for future Supabase integration.

## Not Implemented (planned per README)
- Supabase Auth, projects/boards, snapshots.
- Realtime presence/chat.
- Firecrawl /v2/crawl and /v2/extract flows and webhook ingest.
- Vector embeddings and search in Postgres/pgvector.
- LangGraph graphs (deepResearch, planToDiagram, pmfCompare).
- Excalidraw element conversion from Mermaid and asset management.
- Inspiration surfacer and PMF competitor matrix UI.
- Rate limiting, Langfuse/Helicone observability, deployments.

## Needs From You
- FIRECRAWL_API_KEY: obtain from Firecrawl and add to your local .env.
- Decision: Collab transport for MVP — proceed with excalidraw-room (recommended) or target Yjs/Hocuspocus. Provide the room server URL if running one.
- Supabase project details (if proceeding next): project URL, anon key, schema decisions (we have a sketch), and bucket setup for assets.
- Branding/product decisions: default org/project naming, any initial example projects to seed.

## Next Suggested Steps
1) Wire Supabase Auth + minimal "boards" table; persist board snapshots.
2) Add excalidraw-room live collaboration.
3) Expand research to ingest + display citations and allow dragging references to canvas.
4) Add Mermaid → Excalidraw insertion utility.

