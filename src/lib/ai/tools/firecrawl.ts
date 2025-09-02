export const FC_URL = "https://api.firecrawl.dev/v2";

const headers = (key: string) => ({
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
});

export type SearchArgs = {
  query: string;
  limit?: number;
  sources?: ("web" | "news" | "images")[];
  tbs?: string;
  location?: string;
  scrapeOptions?: any;
};

export async function fcSearch(args: SearchArgs) {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  const res = await fetch(`${FC_URL}/search`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(args),
    // Avoid edge runtime issues
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl search failed (${res.status}): ${text}`);
  }
  return res.json();
}

