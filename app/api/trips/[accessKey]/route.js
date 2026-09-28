import { NextResponse } from "next/server";
import { loadTripByAccessKey } from "../../../../lib/db.js";
import { calculateSplit } from "../../../../lib/split.js";

export async function GET(_request, { params }) {
  try {
    const { accessKey } = await params;
    const data = await loadTripByAccessKey(accessKey);
    if (!data) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

    const split = calculateSplit(data.participants, data.items, data.selections);
    return NextResponse.json({ ...data, split });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Could not load trip." }, { status: 500 });
  }
}
