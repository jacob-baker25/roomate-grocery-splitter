export function calculateSplit(participants, items, selections) {
  const people = [...participants].sort((a, b) => a.sort_order - b.sort_order);
  const totals = Object.fromEntries(people.map((p) => [p.id, 0]));
  const selectedByItem = new Map();

  for (const selection of selections) {
    if (!selectedByItem.has(selection.item_id)) selectedByItem.set(selection.item_id, new Set());
    selectedByItem.get(selection.item_id).add(selection.participant_id);
  }

  const allocations = {};
  let allocatedCents = 0;
  let unclaimedCents = 0;

  for (const item of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
    const selectedSet = selectedByItem.get(item.id) || new Set();
    const selectedPeople = people.filter((p) => selectedSet.has(p.id));
    allocations[item.id] = {};

    if (selectedPeople.length === 0) {
      unclaimedCents += item.price_cents;
      continue;
    }

    const base = Math.floor(item.price_cents / selectedPeople.length);
    let remainder = item.price_cents % selectedPeople.length;

    selectedPeople.forEach((person) => {
      const share = base + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      allocations[item.id][person.id] = share;
      totals[person.id] += share;
      allocatedCents += share;
    });
  }

  return { totals, allocations, allocatedCents, unclaimedCents };
}
