import { db } from "./db.js";
import { lookupUnknownProducts } from "./costcoLookup.js";

function clean(value, limit = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function catalogRow(item, overrides = {}) {
  return {
    item_code: clean(item.code, 30),
    receipt_name: clean(item.receipt_name || item.name),
    display_name: clean(item.name),
    source: item.name_source || "user",
    confidence: item.name_source === "user" ? 1 : null,
    source_url: item.source_url ? clean(item.source_url, 500) : null,
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

async function readCatalog() {
  try {
    return await db.select(
      "product_names",
      "select=item_code,receipt_name,display_name,source,confidence,source_url"
    ) || [];
  } catch (error) {
    console.warn("Product-name catalog is unavailable. Run supabase/product-names-migration.sql.", error.message);
    return null;
  }
}

async function saveRows(rows) {
  if (!rows.length) return;
  try {
    await db.upsert("product_names", rows, "item_code");
  } catch (error) {
    console.warn("Could not save product names; receipt processing will continue.", error.message);
  }
}

export async function enrichProductNames(items) {
  const rows = await readCatalog();
  const byCode = new Map((rows || []).map((row) => [String(row.item_code), row]));

  let enriched = items.map((item) => {
    const saved = byCode.get(String(item.code));
    if (!saved) return item;
    return {
      ...item,
      name: saved.display_name,
      suggested_name: saved.display_name,
      name_source: "catalog",
      catalog_source: saved.source,
      source_url: saved.source_url || null
    };
  });

  const unknown = enriched.filter((item) => item.name_source === "receipt");
  if (!unknown.length) return enriched;

  const found = await lookupUnknownProducts(unknown);
  const discoveredRows = [];
  enriched = enriched.map((item) => {
    const result = found.get(String(item.code));
    if (!result) return item;
    const resolved = {
      ...item,
      name: result.displayName,
      suggested_name: result.displayName,
      name_source: "online",
      name_confidence: result.confidence,
      source_url: result.sourceUrl
    };
    discoveredRows.push(catalogRow(resolved, {
      source: "online",
      confidence: result.confidence,
      source_url: result.sourceUrl
    }));
    return resolved;
  });

  if (rows !== null) await saveRows(discoveredRows);
  return enriched;
}

export async function rememberProductNames(items) {
  const pending = new Map();

  for (const item of items || []) {
    const code = clean(item.code, 30);
    const name = clean(item.name);
    if (!/^\d{4,8}$/.test(code) || !name) continue;

    const suggested = clean(item.suggested_name || item.receipt_name);
    const wasEdited = Boolean(suggested) && name !== suggested;
    if (!wasEdited && item.name_source !== "online") continue;

    pending.set(code, catalogRow(item, {
      source: wasEdited ? "user" : "online",
      confidence: wasEdited ? 1 : Number(item.name_confidence || 0.8)
    }));
  }

  await saveRows([...pending.values()]);
}
