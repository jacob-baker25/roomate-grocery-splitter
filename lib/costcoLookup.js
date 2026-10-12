const LOOKUP_TIMEOUT_MS = 5000;
const MAX_CONCURRENT_LOOKUPS = 4;

function decodeEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function resultUrl(href) {
  const decoded = decodeEntities(href);
  try {
    const url = new URL(decoded.startsWith("//") ? `https:${decoded}` : decoded);
    return url.searchParams.get("uddg") || url.href;
  } catch {
    return decoded;
  }
}

export function cleanSearchResultTitle(title) {
  return decodeEntities(title)
    .replace(/\s+(?:Same-Day Delivery\s*)?[|–—-]\s*Costco(?: Wholesale| Same-Day)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findCostcoNameInSearchHtml(html, itemCode, receiptName = "") {
  const code = String(itemCode || "").trim();
  if (!code) return null;

  const receiptTokens = String(receiptName || "").toLowerCase().match(/[a-z]{3,}/g) || [];
  const matches = [...String(html || "").matchAll(
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  )];

  const candidates = matches.map((match, index) => {
    const segmentEnd = matches[index + 1]?.index ?? Math.min(String(html).length, match.index + 5000);
    const segment = String(html).slice(match.index, segmentEnd);
    const snippetMatch = segment.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const title = decodeEntities(match[2]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const snippet = decodeEntities(snippetMatch?.[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const url = resultUrl(match[1]);
    const combined = `${title} ${snippet} ${url}`.toLowerCase();
    const codePattern = new RegExp(`(^|\\D)${code}(\\D|$)`);
    const codeInTitle = codePattern.test(title);
    const codePresent = codePattern.test(combined);
    let hostname = "";
    try { hostname = new URL(url).hostname.toLowerCase(); } catch {}

    let score = codePresent ? 5 : 0;
    if (codeInTitle) score += 8;
    if (hostname === "costco.com" || hostname.endsWith(".costco.com")) score += 5;
    score += Math.min(3, receiptTokens.filter((token) => combined.includes(token)).length);

    const displayName = cleanSearchResultTitle(title)
      .replace(new RegExp(`[,\\s–—-]*(?:Costco\\s+)?Item\\s*:?#?\\s*${code}.*$`, "i"), "")
      .trim();
    return { displayName, url, score, codeInTitle, isCostco: hostname.endsWith("costco.com") };
  }).filter((candidate) =>
    candidate.score >= 10 &&
    (candidate.codeInTitle || candidate.isCostco) &&
    candidate.displayName.length >= 4 &&
    !/^Costco\s+\d+\s+Delivery Near Me$/i.test(candidate.displayName) &&
    !/^(costco|search|costco customer service|costco item)$/i.test(candidate.displayName)
  );

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;
  return {
    displayName: best.displayName.slice(0, 160),
    sourceUrl: best.url,
    confidence: best.isCostco ? 0.9 : 0.82
  };
}

export async function lookupCostcoProduct(itemCode, receiptName, fetchImpl = fetch) {
  const code = String(itemCode || "").trim();
  if (!/^\d{4,8}$/.test(code)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  const query = `"${code}" Costco ${String(receiptName || "").trim()}`;

  try {
    const response = await fetchImpl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CostcoSplitter/1.0; household use)" },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) return null;
    return findCostcoNameInSearchHtml(await response.text(), code, receiptName);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupUnknownProducts(items, lookup = lookupCostcoProduct) {
  const results = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      const result = await lookup(item.code, item.receipt_name);
      if (result) results.set(String(item.code), result);
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(MAX_CONCURRENT_LOOKUPS, items.length) },
    () => worker()
  ));
  return results;
}
