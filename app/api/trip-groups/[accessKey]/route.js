import { NextResponse } from "next/server";
import { loadTripGroupByAccessKey } from "../../../../lib/db.js";

export async function GET(_request, { params }) {
  try {
    const { accessKey } = await params;
    const data = await loadTripGroupByAccessKey(accessKey);
    if (!data) return NextResponse.json({ error: "Trip list not found." }, { status: 404 });

    return NextResponse.json({
      trips: data.trips.map(({ trip, participants }) => ({
        accessKey: trip.access_key,
        storeName: trip.store_name,
        receiptDate: trip.receipt_date,
        receiptTotalCents: trip.receipt_total_cents,
        createdAt: trip.created_at,
        participantNames: participants.map((person) => person.name),
        respondedCount: participants.filter((person) => person.responded).length,
        participantCount: participants.length
      }))
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Could not load the trip list." }, { status: 500 });
  }
}
