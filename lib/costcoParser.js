const moneyAtEnd = /(-?\d+\.\d{2})(?:\s+([A-Z]))?\s*$/;

export const DISPLAY_NAMES_BY_ITEM_CODE = Object.freeze({
  "1150189": "SkinnyPop Organic Popcorn",
  "1424237": "Kirkland Grass-Fed Salted Butter",
  "33724": "Ground Beef 88% Lean / 12% Fat",
  "1193444": "Kirkland Red Plastic Cups",
  "637598": "Kirkland Large Cage-Free Eggs",
  "47292": "Wild Sockeye Salmon Fillet",
  "1701671": "Kirkland Scented Kitchen Trash Bags",
  "58685": "4C Seasoned Bread Crumbs",
  "1446716": "Grilled Chipotle Seasoned Chicken",
  "1963389": "Miami Beef Grass-Fed Ground Beef",
  "33841": "Kirkland Boneless Skinless Chicken Breasts",
  "1737607": "Real Good Chicken & Pepper Jack Burritos",
  "1831841": "Goodles Mac & Cheese Variety Pack",
  "428409": "Gold Star Membership Renewal",
  "1602320": "Kirkland Organic Ground Paprika",
  "848008": "McCormick Garlic Powder",
  "992756": "Kraft Grated Parmesan Cheese",
  "803428": "Barilla Thin Spaghetti",
  "1919326": "Bounty Advanced Paper Towels",
  "2067029": "Tide Pods Unstopables Laundry Detergent, Fresh, 80-count",
  "2848101": "Cascade Complete Shine Boost Dishwasher ActionPacs, Fresh, 92-count",
  "1668206": "Real Good Foods Lightly Breaded Chicken Strips, 3 lb",
  "33593": "USDA Choice Beef Loin New York Strip Steak",
  "22041": "Kirkland Boneless Skinless Chicken Thighs",
  "1717856": "Scotch-Brite Zero Scratch Sponges, 24-count",
  "2046269": "Mrs. Meyer's Clean Day Hand Soap Variety Pack, 4-count",
  "1478988": "Kinder's Buttery Garlic & Herb Seasoning",
  "692731": "Kirkland Organic Extra Virgin Olive Oil"
});

function cleanLine(raw) {
  return raw.replace(/\s+/g, " ").trim();
}

export function getCostcoDisplayName(itemCode, receiptName) {
  const cleaned = cleanLine(String(receiptName || ""));
  return DISPLAY_NAMES_BY_ITEM_CODE[String(itemCode || "").trim()] || cleaned;
}

export function hasSeedDisplayName(itemCode) {
  return Object.hasOwn(DISPLAY_NAMES_BY_ITEM_CODE, String(itemCode || "").trim());
}

export function parseCostcoText(text) {
  const rawLines = String(text || "").split(/\r?\n/).map(cleanLine).filter(Boolean);
  const items = [];
  const itemByCode = new Map();
  let store = "Costco";
  let receiptDate = null;
  let subtotalCents = null;
  let taxCents = 0;
  let totalCents = null;
  let pendingQuantity = 1;
  let reachedSubtotal = false;

  for (const line of rawLines) {
    if (/^[A-Z][A-Z ]+ #\d+$/i.test(line) && !line.startsWith("TOTAL")) {
      store = line;
    }

    const p7 = line.match(/\bP7\s+(\d{2}\/\d{2}\/\d{4})\b/);
    if (p7) receiptDate = p7[1];
    if (!receiptDate) {
      const txnDate = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}\b/);
      if (txnDate) receiptDate = txnDate[1];
    }

    const subtotal = line.match(/^SUBTOTAL\s+(\d+\.\d{2})$/i);
    if (subtotal) {
      subtotalCents = Math.round(Number(subtotal[1]) * 100);
      reachedSubtotal = true;
      continue;
    }
    const tax = line.match(/^TAX\s+(\d+\.\d{2})$/i);
    if (tax) {
      taxCents = Math.round(Number(tax[1]) * 100);
      continue;
    }
    const total = line.match(/^(?:\*+\s*)?TOTAL\s+(\d+\.\d{2})$/i);
    if (total) {
      totalCents = Math.round(Number(total[1]) * 100);
      continue;
    }

    if (reachedSubtotal) continue;

    const qty = line.match(/^(\d+)\s*@\s*(\d+\.\d{2})$/);
    if (qty) {
      pendingQuantity = Math.max(1, Number(qty[1]));
      continue;
    }

    const discount = line.match(/^\d+\s+\/(\d+)\s+(\d+\.\d{2})-$/);
    if (discount) {
      const targetCode = discount[1];
      const amountCents = Math.round(Number(discount[2]) * 100);
      const target = itemByCode.get(targetCode);
      if (target) {
        target.discount_cents += amountCents;
        target.price_cents -= amountCents;
      }
      continue;
    }

    const normalized = line.replace(/^E\s+/, "");
    const amountMatch = normalized.match(moneyAtEnd);
    if (!amountMatch) continue;

    const beforeAmount = normalized.slice(0, amountMatch.index).trim();
    const firstSpace = beforeAmount.indexOf(" ");
    if (firstSpace < 1) continue;
    const code = beforeAmount.slice(0, firstSpace);
    const receiptName = beforeAmount.slice(firstSpace + 1).trim();
    if (!/^\d{4,8}$/.test(code) || !receiptName) continue;

    const originalPriceCents = Math.round(Number(amountMatch[1]) * 100);
    const displayName = getCostcoDisplayName(code, receiptName);
    const item = {
      code,
      receipt_name: receiptName,
      name: displayName,
      suggested_name: displayName,
      name_source: hasSeedDisplayName(code) ? "seed" : "receipt",
      quantity: pendingQuantity,
      original_price_cents: originalPriceCents,
      discount_cents: 0,
      price_cents: originalPriceCents
    };
    pendingQuantity = 1;
    items.push(item);
    itemByCode.set(code, item);
  }

  const parsedItemCents = items.reduce((sum, item) => sum + item.price_cents, 0);

  return {
    store,
    receiptDate,
    subtotalCents,
    taxCents,
    totalCents,
    parsedItemCents,
    items
  };
}
