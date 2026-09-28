import { NextResponse } from "next/server";
import { extractPdfText } from "../../../lib/pdf.js";
import { parseCostcoText } from "../../../lib/costcoParser.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("receipt");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "Please upload a PDF receipt." }, { status: 400 });
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "The receipt must be a PDF." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const text = await extractPdfText(buffer);
    const parsed = parseCostcoText(text);

    if (!parsed.items.length) {
      return NextResponse.json({ error: "I could not identify Costco line items in this PDF." }, { status: 422 });
    }

    return NextResponse.json({ ...parsed, rawText: text });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Receipt parsing failed." }, { status: 500 });
  }
}
