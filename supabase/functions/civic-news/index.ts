import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NewsSource {
  name: string;
  rssUrl: string;
  homepage: string;
}

const NEWS_SOURCES: NewsSource[] = [
  {
    name: "AP News",
    rssUrl: "https://feeds.apnews.com/rss/apf-topnews",
    homepage: "https://apnews.com",
  },
  {
    name: "Reuters",
    rssUrl: "https://feeds.reuters.com/reuters/topNews",
    homepage: "https://reuters.com",
  },
  {
    name: "CNN",
    rssUrl: "http://rss.cnn.com/rss/cnn_topstories.rss",
    homepage: "https://cnn.com",
  },
];

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const itemMatches = xml.match(itemRegex) ?? [];

  for (const itemXml of itemMatches.slice(0, 5)) {
    const titleMatch = itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const pubDateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const descMatch = itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/i);

    items.push({
      title: stripHtml(titleMatch?.[1] ?? ""),
      link: stripHtml(linkMatch?.[1] ?? ""),
      pubDate: stripHtml(pubDateMatch?.[1] ?? ""),
      description: stripHtml(descMatch?.[1] ?? "").slice(0, 280),
    });
  }

  return items;
}

function isCivicRelevant(title: string, description: string): boolean {
  const text = (title + " " + description).toLowerCase();
  const keywords = [
    "election", "vote", "voter", "ballot", "candidate", "campaign",
    "congress", "senate", "house", "governor", "mayor", "primary",
    "caucus", "poll", "political", "policy", "legislation", "bill",
    "lawmaker", "partisan", "democrat", "republican", "civic",
    "government", "democracy", "president", "amendment", "district",
    "legislature", "municipal", "council", " referendum",
  ];
  return keywords.some((k) => text.includes(k));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "fetch";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "fetch") {
      const maxPerSource = parseInt(url.searchParams.get("max") ?? "3", 10);
      let totalInserted = 0;

      for (const source of NEWS_SOURCES) {
        try {
          const response = await fetch(source.rssUrl, {
            headers: {
              "User-Agent": "BallotLens/1.0 (civic engagement platform)",
              "Accept": "application/rss+xml, application/xml, text/xml",
            },
            signal: AbortSignal.timeout(10000),
          });

          if (!response.ok) continue;

          const xml = await response.text();
          const items = parseRSS(xml);

          const civicItems = items
            .filter((item) => isCivicRelevant(item.title, item.description))
            .slice(0, maxPerSource);

          for (const item of civicItems) {
            // Check if we already have this article (dedup by source_url)
            const { data: existing } = await supabase
              .from("feed_posts")
              .select("id")
              .eq("source_url", item.link)
              .maybeSingle();

            if (existing) continue;

            // Insert as a news feed post
            const postBody = item.description
              ? `${item.title}\n\n${item.description}`
              : item.title;

            await supabase.from("feed_posts").insert({
              post_type: "news",
              body: postBody,
              source_name: source.name,
              source_url: item.link,
              link_url: item.link,
              is_pinned: false,
            });

            totalInserted++;
          }
        } catch {
          // Skip sources that fail — continue with others
          continue;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          sourcesChecked: NEWS_SOURCES.length,
          articlesAdded: totalInserted,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "sources") {
      return new Response(
        JSON.stringify({
          sources: NEWS_SOURCES.map((s) => ({ name: s.name, homepage: s.homepage })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use action=fetch or action=sources" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
