import test from "node:test";
import assert from "node:assert/strict";
import { parseCostcoText } from "../lib/costcoParser.js";
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
  assert.equal(butter.original_price_cents, 999);
  assert.equal(butter.discount_cents, 200);
  assert.equal(butter.price_cents, 799);
  const chicken = parsed.items.find((i) => i.code === "1446716");
  assert.equal(chicken.quantity, 2);
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
