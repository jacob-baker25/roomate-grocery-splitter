import { NextResponse } from "next/server";
import { db, loadTripByAccessKey } from "../../../../../lib/db.js";

const VALID_MODES = new Set(["choice", "everyone", "custom"]);

export async function PATCH(request, { params }) {
  try {
    const { accessKey } = await params;
    const body = await request.json();
    const data = await loadTripByAccessKey(accessKey);
    if (!data) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

    const actor = data.participants.find((person) => person.id === body.participantId);
    const item = data.items.find((candidate) => candidate.id === body.itemId);
    const mode = String(body.mode || "");
    if (!actor || !item || !VALID_MODES.has(mode)) {
      return NextResponse.json({ error: "Invalid person, item, or split mode." }, { status: 400 });
    }

    const currentMode = item.split_mode || "choice";
    const purchaserOnlyChange = currentMode === "everyone" || mode === "everyone";
    if (purchaserOnlyChange && actor.id !== data.trip.payer_participant_id) {
      return NextResponse.json({ error: "Only the purchaser can change an Everyone pays item." }, { status: 403 });
    }

    let customRows = [];
    if (mode === "custom") {
      let invalidWeight = false;
      customRows = data.participants.flatMap((person) => {
        const weight = Math.round(Number(body.weights?.[person.id]) || 0);
        if (weight < 0 || weight > 99) {
          invalidWeight = true;
          return [];
        }
        return weight > 0 ? [{
          trip_id: data.trip.id,
          participant_id: person.id,
          item_id: item.id,
          weight
        }] : [];
      });
      if (invalidWeight) {
        return NextResponse.json({ error: "Each custom share must be between 0 and 99." }, { status: 400 });
      }
      if (!customRows.length) {
        return NextResponse.json({ error: "Give at least one person a custom share." }, { status: 400 });
      }
    }

    const existingRows = data.selections.filter((selection) => selection.item_id === item.id);
    await db.update("items", `id=eq.${item.id}`, { split_mode: mode });
    await db.delete("selections", `trip_id=eq.${data.trip.id}&item_id=eq.${item.id}`);

    if (mode === "custom") {
      await db.insert("selections", customRows);
    } else if (mode === "choice" && currentMode === "custom" && existingRows.length) {
      await db.insert("selections", existingRows.map((selection) => ({
        trip_id: data.trip.id,
        participant_id: selection.participant_id,
        item_id: item.id,
        weight: 1
      })));
    }

    await db.update("participants", `trip_id=eq.${data.trip.id}`, { responded: false });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Could not update the split." }, { status: 500 });
  }
}
