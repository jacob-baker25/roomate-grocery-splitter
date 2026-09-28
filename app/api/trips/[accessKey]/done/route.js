import { NextResponse } from "next/server";
import { db, loadTripByAccessKey } from "../../../../../lib/db.js";

export async function POST(request, { params }) {
  try {
    const { accessKey } = await params;
    const body = await request.json();
    const data = await loadTripByAccessKey(accessKey);
    if (!data) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

    const participant = data.participants.find((p) => p.id === body.participantId);
    if (!participant) return NextResponse.json({ error: "Invalid person." }, { status: 400 });

    await db.update("participants", `id=eq.${participant.id}`, { responded: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Could not mark response complete." }, { status: 500 });
  }
}
