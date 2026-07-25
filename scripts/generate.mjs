/* =========================================================
   BharatWire briefing generator
   Runs inside GitHub Actions. Fetches RSS feeds directly
   (no CORS issues server-side), writes news.json, then asks
   Claude to write an original editorial briefing → briefing.json
   ========================================================= */

const FEEDS = [
  {cat:"Top Stories",   url:"https://timesofindia.indiatimes.com/rssfeedstopstories.cms", src:"Times of India"},
  {cat:"India",         url:"https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms", src:"Times of India"},
  {cat:"India",         url:"https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", src:"Hindustan Times"},
  {cat:"Business",      url:"https://timesofindia.indiatimes.com/rssfeeds/1898055.cms", src:"Times of India"},
  {cat:"Technology",    url:"https://www.hindustantimes.com/feeds/rss/technology/rssfeed.xml", src:"Hindustan Times"},
  {cat:"Technology",    url:"https://feeds.feedburner.com/gadgets360-latest", src:"Gadgets360"},
  {cat:"Sports",        url:"https://timesofindia.indiatimes.com/rssfeeds/4719148.cms", src:"Times of India"},
  {cat:"Entertainment", url:"https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms", src:"Times of India"},
  {cat:"World",         url:"https://timesofindia.indiatimes.com/rssfeeds/296589292.cms", src:"Times of India"},
  {cat:"Top Stories",   url:"https://feeds.feedburner.com/ndtvnews-top-stories", src:"NDTV"},
  {cat:"Horoscope",     url:"https://www.hindustantimes.com/feeds/rss/astrology/horoscope/rssfeed.xml", src:"Hindustan Times"},
  {cat:"Horoscope",     url:"https://www.hindustantimes.com/feeds/rss/astrology/rssfeed.xml", src:"Hindustan Times"},
];

import { writeFileSync } from "node:fs";

/* ---------- tiny RSS parsing (regex-based, no dependencies) ---------- */
function tag(block, name){
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if(!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}
function attr(block, tagName, attrName){
  const m = block.match(new RegExp(`<${tagName}[^>]*${attrName}=["']([^"']+)["']`, "i"));
  return m ? m[1] : "";
}
function stripHtml(s){
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&")
          .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#0?39;/g,"'")
          .replace(/&quot;/g,'"').replace(/\s+/g," ").trim();
}
function upscale(url){
  if(!url) return "";
  return url
    .replace(/width-\d+/g, "width-1200")
    .replace(/height-\d+,?/g, "")
    .replace(/resizemode-\d+/g, "resizemode-4")
    .replace(/\/\d{2,3}x\d{2,3}\//, "/1200x675/");
}

async function fetchFeed(feed){
  try{
    const res = await fetch(feed.url, {
      headers: {"User-Agent": "Mozilla/5.0 (BharatWire briefing bot)"},
      signal: AbortSignal.timeout(15000),
    });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const xml = await res.text();
    const items = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].slice(0, 12);
    return items.map(m => {
      const block = m[1];
      const rawDesc = tag(block, "description");
      let img = attr(block, "enclosure", "url")
             || attr(block, "media:content", "url")
             || (rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? "");
      const date = new Date(tag(block, "pubDate") || Date.now());
      return {
        title: stripHtml(tag(block, "title")),
        link: stripHtml(tag(block, "link") || tag(block, "guid")),
        desc: stripHtml(rawDesc).slice(0, 300),
        img: upscale(img),
        cat: feed.cat,
        src: feed.src,
        date: isNaN(date) ? new Date().toISOString() : date.toISOString(),
      };
    }).filter(x => x.title && x.link);
  }catch(e){
    console.warn("Feed failed:", feed.src, feed.cat, e.message);
    return [];
  }
}

/* ---------- main ---------- */
const results = await Promise.all(FEEDS.map(fetchFeed));
const seen = new Set();
const items = results.flat().filter(x => {
  const k = x.title.toLowerCase();
  if(seen.has(k)) return false;
  seen.add(k); return true;
}).sort((a,b) => new Date(b.date) - new Date(a.date));

if(!items.length){
  console.error("No feed items fetched — keeping previous news.json/briefing.json");
  process.exit(0); // don't fail the workflow; last good files remain
}

writeFileSync("news.json", JSON.stringify(items.slice(0, 150)));
console.log(`news.json written: ${items.length} stories`);

/* ---------- ask GPT for an original briefing ---------- */
const API_KEY = process.env.OPENAI_API_KEY;
if(process.env.GENERATE_BRIEFING === "false"){
  console.log("Hourly news-only run — skipping briefing generation.");
  process.exit(0);
}
if(!API_KEY){
  console.warn("No OPENAI_API_KEY set — skipping briefing generation.");
  process.exit(0);
}

const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
const hourIST = istNow.getUTCHours();
const edition = hourIST < 11 ? "Morning Edition" : hourIST < 16 ? "Midday Edition" : "Evening Edition";
const dateStr = istNow.toISOString().slice(0, 10);

// compact headline digest for the prompt (news categories only)
const digest = ["Top Stories","India","Business","Technology","Sports","Entertainment","World"]
  .map(cat => {
    const list = items.filter(x => x.cat === cat).slice(0, 8)
      .map(x => `- ${x.title}${x.desc ? " — " + x.desc.slice(0,120) : ""}`).join("\n");
    return list ? `## ${cat}\n${list}` : "";
  }).filter(Boolean).join("\n\n");

const prompt = `You are the editorial desk of BharatWire, an independent Indian news briefing.
Today is ${dateStr} (IST). This is the ${edition}.

Below are today's headlines from wire sources. Write an ORIGINAL briefing in your own words — do not copy any headline text verbatim. Synthesize, connect stories, add context an informed Indian reader would value. Neutral, sharp, conversational-but-credible tone. No sensationalism.

Respond with ONLY valid JSON (no markdown fences), exactly this shape:
{
  "headline": "one compelling original title for today's briefing, max 12 words",
  "intro": "2-3 sentence opening that frames the day",
  "sections": [
    {"title": "short section heading", "body": "3-5 sentences of original analysis"},
    ... (3 to 4 sections covering the most significant themes across categories)
  ],
  "quick_takes": ["one-line original observation", ... (4 to 6 items)]
}

Headlines digest:
${digest}`;

try{
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + API_KEY,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 1500,
      response_format: {type: "json_object"},
      messages: [{role: "user", content: prompt}],
    }),
  });
  if(!res.ok) throw new Error("API " + res.status + ": " + await res.text());
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  const clean = text.replace(/```json|```/g, "").trim();
  const briefing = JSON.parse(clean);

  briefing.edition = edition;
  briefing.generated_at = new Date().toISOString();
  writeFileSync("briefing.json", JSON.stringify(briefing));
  console.log("briefing.json written:", briefing.headline);
}catch(e){
  console.error("Briefing generation failed (site keeps last briefing):", e.message);
}
