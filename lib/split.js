export function allocateCentsByWeight(people, priceCents, weights) {
  const weightedPeople = people
    .map((person) => ({ person, weight: Math.max(0, Math.round(Number(weights[person.id]) || 0)) }))
    .filter(({ weight }) => weight > 0);
  const totalWeight = weightedPeople.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) return {};

  const shares = weightedPeople.map(({ person, weight }) => {
    const numerator = priceCents * weight;
    return {
      person,
      cents: Math.floor(numerator / totalWeight),
      remainder: numerator % totalWeight
    };
  });
  let centsLeft = priceCents - shares.reduce((sum, share) => sum + share.cents, 0);
  const remainderOrder = [...shares].sort((a, b) =>
    b.remainder - a.remainder || a.person.sort_order - b.person.sort_order
  );

  for (let index = 0; index < centsLeft; index += 1) {
    remainderOrder[index].cents += 1;
  }

  return Object.fromEntries(shares.map(({ person, cents }) => [person.id, cents]));
}

export function calculateSplit(participants, items, selections) {
  const people = [...participants].sort((a, b) => a.sort_order - b.sort_order);
  const totals = Object.fromEntries(people.map((p) => [p.id, 0]));
  const selectedByItem = new Map();

  for (const selection of selections) {
    if (!selectedByItem.has(selection.item_id)) selectedByItem.set(selection.item_id, new Map());
    selectedByItem.get(selection.item_id).set(selection.participant_id, Math.max(1, Math.round(Number(selection.weight) || 1)));
  }

  const allocations = {};
  let allocatedCents = 0;
  let unclaimedCents = 0;

  for (const item of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
    const mode = item.split_mode || "choice";
    const savedWeights = selectedByItem.get(item.id) || new Map();
    const weights = mode === "everyone"
      ? Object.fromEntries(people.map((person) => [person.id, 1]))
      : mode === "custom"
        ? Object.fromEntries(savedWeights)
        : Object.fromEntries([...savedWeights.keys()].map((participantId) => [participantId, 1]));
    allocations[item.id] = {};

    if (!Object.keys(weights).length) {
      unclaimedCents += item.price_cents;
      continue;
    }

    allocations[item.id] = allocateCentsByWeight(people, item.price_cents, weights);
    for (const [participantId, share] of Object.entries(allocations[item.id])) {
      totals[participantId] += share;
      allocatedCents += share;
    }
  }

  return { totals, allocations, allocatedCents, unclaimedCents };
}
