"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "../lib/money.js";
import { HOUSEHOLD_NAMES } from "../lib/household.js";

export default function Home() {
  const [count, setCount] = useState(6);
  const [payerIndex, setPayerIndex] = useState(0);
  const [receipt, setReceipt] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("costco-splitter-household");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.count) setCount(Math.min(6, Math.max(1, parsed.count)));
      if (Number.isInteger(parsed.payerIndex)) setPayerIndex(parsed.payerIndex);
    } catch {}
  }, []);

  const activeNames = HOUSEHOLD_NAMES.slice(0, count);
  const itemTotal = useMemo(() => items.reduce((sum, i) => sum + Number(i.price_cents || 0), 0), [items]);
  const receiptMatches = receipt?.subtotalCents == null || itemTotal === receipt.subtotalCents;

  async function parseReceipt(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("receipt", file);
      const response = await fetch("/api/parse-receipt", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not parse receipt.");
      setReceipt(data);
      setItems(data.items);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function updateItem(index, patch) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function createTrip() {
    setError("");
    if (!items.length) return setError("Upload a receipt or add at least one item.");

    setBusy(true);
    try {
      localStorage.setItem("costco-splitter-household", JSON.stringify({ count, payerIndex }));
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: activeNames, payerIndex, receipt, items })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create trip.");
      window.location.href = `/trip/${data.accessKey}`;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="stack xl">
      <header className="hero">
        <span className="eyebrow">WEEKLY COSTCO RUN</span>
        <h1>Split the cart, not the headache.</h1>
        <p>Upload the Costco receipt, choose who is participating this week, and send one link so everyone can claim the items they want to split.</p>
      </header>

      <section className="card stack">
        <div className="sectionTitle"><span className="step">1</span><div><h2>People this trip</h2><p>Use fewer than six if someone bought nothing this week.</p></div></div>
        <div className="segmented">
          {[1,2,3,4,5,6].map((n) => <button key={n} className={count === n ? "active" : ""} onClick={() => { setCount(n); setPayerIndex((p) => Math.min(p, n - 1)); }}>{n}</button>)}
        </div>
        <div className="nameGrid">
          {activeNames.map((name, i) => <div key={name}><span>Person {i + 1}</span><strong>{name}</strong></div>)}
        </div>
        <label><span>Who paid?</span><select value={payerIndex} onChange={(e) => setPayerIndex(Number(e.target.value))}>{activeNames.map((name, i) => <option key={i} value={i}>{name || `Person ${i+1}`}</option>)}</select></label>
      </section>

      <section className="card stack">
        <div className="sectionTitle"><span className="step">2</span><div><h2>Upload the Costco PDF</h2><p>The parser pulls out item names, prices, quantities and item-level discounts. You can correct anything before creating the trip.</p></div></div>
        <label className="upload">
          <input type="file" accept="application/pdf" onChange={(e) => parseReceipt(e.target.files?.[0])} />
          <strong>{busy && !receipt ? "Reading receipt…" : "Choose PDF receipt"}</strong>
          <span>Costco.com Orders & Purchases PDF</span>
        </label>

        {receipt && <div className="receiptMeta">
          <div><span>Store</span><strong>{receipt.store}</strong></div>
          <div><span>Receipt subtotal</span><strong>{formatMoney(receipt.subtotalCents)}</strong></div>
          <div><span>Parsed items</span><strong>{items.length}</strong></div>
          <div><span>Check</span><strong className={receiptMatches ? "good" : "warn"}>{receiptMatches ? "Matches" : `${formatMoney(itemTotal)} parsed`}</strong></div>
        </div>}

        {items.length > 0 && <div className="itemEditor">
          {items.map((item, index) => <div className="editRow" key={`${item.code}-${index}`}>
            <div className="itemIndex">{index + 1}</div>
            <input className="grow" value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} />
            <div className="moneyInput"><span>$</span><input type="number" min="0" step="0.01" value={(item.price_cents / 100).toFixed(2)} onChange={(e) => updateItem(index, { price_cents: Math.round(Number(e.target.value || 0) * 100) })} /></div>
            <button className="iconButton" aria-label="Remove item" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>×</button>
          </div>)}
          <button className="textButton" onClick={() => setItems((current) => [...current, { code: "", name: "New item", quantity: 1, original_price_cents: 0, discount_cents: 0, price_cents: 0 }])}>+ Add item</button>
        </div>}
      </section>

      {error && <div className="error">{error}</div>}
      <button className="primary big" disabled={busy || !items.length} onClick={createTrip}>{busy && receipt ? "Creating…" : "Create trip & get share link"}</button>
      <p className="fineprint">No roommate accounts are required. Anyone with the trip link can update that trip, so treat the link like a small shared household link.</p>
    </div>
  );
}
