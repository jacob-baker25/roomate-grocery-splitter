import { NextResponse } from "next/server";
import { db, loadTripByAccessKey } from "../../../../../lib/db.js";

export async function PATCH(request, { params }) {
  try {
    const { accessKey } = await params;
    const body = await request.json();
    const data = await loadTripByAccessKey(accessKey);
    if (!data) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

    const participant = data.participants.find((p) => p.id === body.participantId);
    const item = data.items.find((i) => i.id === body.itemId);
    if (!participant || !item) {
      return NextResponse.json({ error: "Invalid person or item." }, { status: 400 });
    }

    if (body.selected) {
      await db.upsert("selections", [{
        trip_id: data.trip.id,
        participant_id: participant.id,
        item_id: item.id
      }], "trip_id,participant_id,item_id");
    } else {
      await db.delete("selections", `trip_id=eq.${data.trip.id}&participant_id=eq.${participant.id}&item_id=eq.${item.id}`);
    }

    await db.update("participants", `id=eq.${participant.id}`, { responded: false });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Could not save selection." }, { status: 500 });
  }
}
