import test from "node:test";
import assert from "node:assert/strict";
import { getCostcoDisplayName, parseCostcoText } from "../lib/costcoParser.js";
import { calculateSplit } from "../lib/split.js";

const sample = `
CHRISTIANA #246
E 1150189 ORG SKINYPOP 6.99 N
E 1424237 KS GR FD BTR 9.99 N
388719 /1424237 2.00-
E 33724 GROUND BEEF 38.40 N
1193444 KS RED CUPS 10.89 N
E 637598 KS CAGE FREE 3.79 N
E 47292 SOCK SALMON 20.31 N
1701671 KS SCENT PCR 19.99 N
E 58685 4C BR CRUMBS 8.59 N
2 @ 11.99
E 1446716 CHPTLECHICKN 23.98 N
E 1963389 GRASSFEDGB 24.99 N
E 33841 BNLS/SL BRST 26.97 N
E 1737607 CHICKBURRITO 12.99 N
E 1831841 GOODLESPACK 16.49 N
428409 GLD STR REN 65.00 N
SUBTOTAL 287.37
TAX 0.00
**** TOTAL 287.37
P7 09/03/2026 06:33
`;

test("Costco parser handles the supplied receipt shape and item discount", () => {
  const parsed = parseCostcoText(sample);
  assert.equal(parsed.items.length, 14);
  assert.equal(parsed.subtotalCents, 28737);
  assert.equal(parsed.totalCents, 28737);
  assert.equal(parsed.parsedItemCents, 28737);
  const butter = parsed.items.find((i) => i.code === "1424237");
  assert.equal(butter.name, "Kirkland Grass-Fed Salted Butter");
  assert.equal(butter.original_price_cents, 999);
  assert.equal(butter.discount_cents, 200);
  assert.equal(butter.price_cents, 799);
  const chicken = parsed.items.find((i) => i.code === "1446716");
  assert.equal(chicken.quantity, 2);
  assert.equal(chicken.name, "Grilled Chipotle Seasoned Chicken");
  assert.equal(parsed.items.find((i) => i.code === "1701671").name, "Kirkland Scented Kitchen Trash Bags");
});

test("Costco item numbers get stable display names", () => {
  const expectedNames = {
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
  };

  for (const [itemCode, displayName] of Object.entries(expectedNames)) {
    assert.equal(getCostcoDisplayName(itemCode, "Receipt wording can change"), displayName);
  }
  assert.equal(getCostcoDisplayName("999999", "  unknown   item  "), "unknown item");
});

test("split math preserves every penny", () => {
  const people = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 1 },
    { id: "c", sort_order: 2 }
  ];
  const items = [{ id: "x", sort_order: 0, price_cents: 1000 }];
  const selections = people.map((p) => ({ item_id: "x", participant_id: p.id }));
  const result = calculateSplit(people, items, selections);
  assert.deepEqual(result.totals, { a: 334, b: 333, c: 333 });
  assert.equal(result.allocatedCents, 1000);
});

test("Everyone pays items include every trip participant without checkboxes", () => {
  const people = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 1 },
    { id: "c", sort_order: 2 }
  ];
  const items = [{ id: "paper", sort_order: 0, price_cents: 1000, split_mode: "everyone" }];
  const result = calculateSplit(people, items, []);

  assert.deepEqual(result.totals, { a: 334, b: 333, c: 333 });
  assert.equal(result.unclaimedCents, 0);
});

test("custom weights support a 3-to-2 split and preserve the item total", () => {
  const people = [
    { id: "jacob", sort_order: 0 },
    { id: "brandon", sort_order: 1 },
    { id: "other", sort_order: 2 }
  ];
  const items = [{ id: "steaks", sort_order: 0, price_cents: 5795, split_mode: "custom" }];
  const selections = [
    { item_id: "steaks", participant_id: "jacob", weight: 2 },
    { item_id: "steaks", participant_id: "brandon", weight: 3 }
  ];
  const result = calculateSplit(people, items, selections);

  assert.deepEqual(result.totals, { jacob: 2318, brandon: 3477, other: 0 });
  assert.equal(result.allocatedCents, 5795);
  assert.equal(result.unclaimedCents, 0);
});

test("custom-weight penny remainders go to the largest fractional share", () => {
  const people = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 1 }
  ];
  const items = [{ id: "x", sort_order: 0, price_cents: 100, split_mode: "custom" }];
  const selections = [
    { item_id: "x", participant_id: "a", weight: 2 },
    { item_id: "x", participant_id: "b", weight: 1 }
  ];

  assert.deepEqual(calculateSplit(people, items, selections).totals, { a: 67, b: 33 });
});
