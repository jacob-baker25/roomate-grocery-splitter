const LOOKUP_TIMEOUT_MS = 8000;
const LOOKUP_RETRY_DELAY_MS = 350;
const MAX_LOOKUP_ATTEMPTS = 2;
const MAX_CONCURRENT_LOOKUPS = 1;

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
    const codeInUrl = codePattern.test(url);
    const codePresent = codePattern.test(combined);
    let hostname = "";
    try { hostname = new URL(url).hostname.toLowerCase(); } catch {}

    let score = codePresent ? 5 : 0;
    if (codeInTitle) score += 8;
    if (codeInUrl) score += 4;
    if (hostname === "costco.com" || hostname.endsWith(".costco.com")) score += 5;
    score += Math.min(3, receiptTokens.filter((token) => combined.includes(token)).length);

    const displayName = cleanSearchResultTitle(title)
      .replace(new RegExp(`[,\\s–—-]*(?:Costco\\s+)?Item\\s*:?#?\\s*${code}.*$`, "i"), "")
      .replace(new RegExp(`\\s*\\(?#?${code}\\b.*$`, "i"), "")
      .replace(/^Costco\s+(?=[A-Z])/i, "")
      .trim();

    let isGenericSearchPage = false;
    try {
      const parsedUrl = new URL(url);
      isGenericSearchPage = /\/(?:store\/costco\/)?s\/?$/i.test(parsedUrl.pathname) &&
        (parsedUrl.searchParams.has("k") || parsedUrl.searchParams.has("keyword"));
    } catch {}

    if (/^KS\b/i.test(displayName)) score -= 10;
    if (displayName.split(/\s+/).length >= 5) score += 2;

    return { displayName, url, score, codePresent, isCostco: hostname.endsWith("costco.com"), isGenericSearchPage };
  }).filter((candidate) =>
    candidate.score >= 10 &&
    candidate.codePresent &&
    !candidate.isGenericSearchPage &&
    candidate.displayName.length >= 4 &&
    !/\bDelivery(?:\s+or\s+Pickup)?\s+Near Me\b/i.test(candidate.displayName) &&
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

  const receipt = String(receiptName || "").trim();
  const queries = [...new Set([
    `"${code}" Costco ${receipt}`.trim(),
    `"${code}" Costco product`
  ])];

  for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
    const query = queries[queryIndex];
    for (let attempt = 1; attempt <= MAX_LOOKUP_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
      try {
        const response = await fetchImpl(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; CostcoSplitter/1.0; household use)" },
          signal: controller.signal,
          cache: "no-store"
        });

        if (!response.ok) {
          console.warn(`[product-lookup] Item ${code}: search returned HTTP ${response.status} (query ${queryIndex + 1}, attempt ${attempt}).`);
          if (attempt < MAX_LOOKUP_ATTEMPTS) await delay(LOOKUP_RETRY_DELAY_MS * attempt);
          continue;
        }

        const html = await response.text();
        const result = findCostcoNameInSearchHtml(html, code, receipt);
        if (result) return result;

        if (!/result__a/i.test(html)) {
          console.warn(`[product-lookup] Item ${code}: search returned no recognizable results (query ${queryIndex + 1}, attempt ${attempt}).`);
          if (attempt < MAX_LOOKUP_ATTEMPTS) {
            await delay(LOOKUP_RETRY_DELAY_MS * attempt);
            continue;
          }
        }
        break;
      } catch (error) {
        const reason = error?.name === "AbortError" ? `${LOOKUP_TIMEOUT_MS}ms timeout` : (error?.message || "network error");
        console.warn(`[product-lookup] Item ${code}: ${reason} (query ${queryIndex + 1}, attempt ${attempt}).`);
        if (attempt < MAX_LOOKUP_ATTEMPTS) await delay(LOOKUP_RETRY_DELAY_MS * attempt);
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  console.warn(`[product-lookup] Item ${code}: no trustworthy product name found after ${queries.length} queries.`);
  return null;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
