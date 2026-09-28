import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "../../../lib/db.js";
import { HOUSEHOLD_NAMES } from "../../../lib/household.js";

function cleanName(value) {
  return String(value || "").trim().slice(0, 40);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const names = (body.names || []).map(cleanName).filter(Boolean);
    if (names.length < 1 || names.length > 6) {
      return NextResponse.json({ error: "Choose between 1 and 6 people." }, { status: 400 });
    }
    if (names.some((name) => !HOUSEHOLD_NAMES.includes(name))) {
      return NextResponse.json({ error: "Choose people from the household list." }, { status: 400 });
    }
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
      return NextResponse.json({ error: "Each person needs a unique name." }, { status: 400 });
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: "Add at least one receipt item." }, { status: 400 });
    }

    const requestedGroupKey = String(body.groupAccessKey || "").trim();
    let tripGroup;
    if (requestedGroupKey) {
      const groups = await db.select("trip_groups", `access_key=eq.${encodeURIComponent(requestedGroupKey)}&select=id,access_key`);
      tripGroup = groups?.[0];
      if (!tripGroup) {
        return NextResponse.json({ error: "That shared trip list could not be found." }, { status: 400 });
      }
    } else {
      const createdGroups = await db.insert("trip_groups", [{
        id: crypto.randomUUID(),
        access_key: crypto.randomBytes(18).toString("base64url")
      }]);
      tripGroup = createdGroups?.[0];
    }

    const tripId = crypto.randomUUID();
    const accessKey = crypto.randomBytes(12).toString("base64url");
    const payerIndex = Math.min(Math.max(Number(body.payerIndex) || 0, 0), names.length - 1);
    const participantIds = names.map(() => crypto.randomUUID());

    await db.insert("trips", [{
      id: tripId,
      access_key: accessKey,
      trip_group_id: tripGroup.id,
      payer_participant_id: participantIds[payerIndex],
      store_name: String(body.receipt?.store || "Costco").slice(0, 100),
      receipt_date: body.receipt?.receiptDate || null,
      receipt_subtotal_cents: body.receipt?.subtotalCents ?? null,
      receipt_tax_cents: body.receipt?.taxCents ?? 0,
      receipt_total_cents: body.receipt?.totalCents ?? null
    }]);

    await db.insert("participants", names.map((name, index) => ({
      id: participantIds[index],
      trip_id: tripId,
      name,
      sort_order: index,
      responded: false
    })));

    await db.insert("items", body.items.map((item, index) => ({
      id: crypto.randomUUID(),
      trip_id: tripId,
      item_code: String(item.code || "").slice(0, 30) || null,
      name: String(item.name || `Item ${index + 1}`).trim().slice(0, 120),
      price_cents: Math.max(0, Math.round(Number(item.price_cents) || 0)),
      original_price_cents: Math.max(0, Math.round(Number(item.original_price_cents ?? item.price_cents) || 0)),
      discount_cents: Math.max(0, Math.round(Number(item.discount_cents) || 0)),
      quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
      sort_order: index
    })));

    return NextResponse.json({ accessKey, groupAccessKey: tripGroup.access_key });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Could not create trip." }, { status: 500 });
  }
}
