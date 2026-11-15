import { NextResponse } from "next/server";
import { db, loadTripByAccessKey } from "../../../../../../lib/db.js";
import { rememberProductNames } from "../../../../../../lib/productCatalog.js";

export async function PATCH(request, { params }) {
  try {
    const { accessKey, itemId } = await params;
    const data = await loadTripByAccessKey(accessKey);
    if (!data) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

    const item = data.items.find((entry) => entry.id === itemId);
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

    const body = await request.json();
    const name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: "Enter an item name." }, { status: 400 });

    const updated = await db.update(
      "items",
      `id=eq.${encodeURIComponent(item.id)}&trip_id=eq.${encodeURIComponent(data.trip.id)}`,
      { name }
    );

    if (item.item_code && name !== item.name) {
      await rememberProductNames([{
        code: item.item_code,
        receipt_name: item.name,
        suggested_name: item.name,
        name,
        name_source: "user"
      }]);
    }

    return NextResponse.json({ item: updated?.[0] || { ...item, name } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Could not rename the item." }, { status: 500 });
  }
}
