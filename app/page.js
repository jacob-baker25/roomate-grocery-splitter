"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "../lib/money.js";
import { HOUSEHOLD_NAMES } from "../lib/household.js";

export default function Home() {
  const [selectedNames, setSelectedNames] = useState([...HOUSEHOLD_NAMES]);
  const [payerName, setPayerName] = useState(HOUSEHOLD_NAMES[0]);
  const [groupAccessKey, setGroupAccessKey] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const requestedGroup = new URLSearchParams(window.location.search).get("group");
    const savedGroup = localStorage.getItem("costco-splitter-trip-group");
    const activeGroup = requestedGroup || savedGroup || "";
    setGroupAccessKey(activeGroup);
    if (requestedGroup) localStorage.setItem("costco-splitter-trip-group", requestedGroup);

    const saved = localStorage.getItem("costco-splitter-household");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const savedNames = Array.isArray(parsed.selectedNames)
        ? HOUSEHOLD_NAMES.filter((name) => parsed.selectedNames.includes(name))
        : HOUSEHOLD_NAMES.slice(0, Math.min(6, Math.max(1, parsed.count || 6)));
      setSelectedNames(savedNames);
      const savedPayer = parsed.payerName || savedNames[parsed.payerIndex];
      setPayerName(savedNames.includes(savedPayer) ? savedPayer : savedNames[0]);
    } catch {}
  }, []);

  const itemTotal = useMemo(() => items.reduce((sum, i) => sum + Number(i.price_cents || 0), 0), [items]);
  const receiptMatches = receipt?.subtotalCents == null || itemTotal === receipt.subtotalCents;

  function togglePerson(name) {
    setSelectedNames((current) => {
      const next = current.includes(name)
        ? current.filter((person) => person !== name)
        : HOUSEHOLD_NAMES.filter((person) => current.includes(person) || person === name);

      if (name === payerName && !next.includes(name)) setPayerName(next[0]);
      if (!payerName && next.length) setPayerName(next[0]);
      return next;
    });
  }

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
    if (!selectedNames.length) return setError("Choose at least one person for this trip.");
    if (!items.length) return setError("Upload a receipt or add at least one item.");

    setBusy(true);
    try {
      const payerIndex = selectedNames.indexOf(payerName);
      localStorage.setItem("costco-splitter-household", JSON.stringify({ selectedNames, payerName }));
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: selectedNames, payerIndex, receipt, items, groupAccessKey })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create trip.");
      localStorage.setItem("costco-splitter-trip-group", data.groupAccessKey);
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
        <h1>Costco receipt splitter</h1>
        <p>Choose who came on this trip, upload the receipt, and share the link with the roommates who need it.</p>
      </header>

      {groupAccessKey && <div className="groupNotice">
        <span><strong>Adding to your shared trip list</strong><small>Roommates will be able to switch between this trip and the others.</small></span>
        <a href={`/list/${groupAccessKey}`}>View trips</a>
      </div>}

      <section className="card stack">
        <div className="sectionTitle"><span className="step">1</span><div><h2>People this trip</h2><p>Select each roommate who should be included.</p></div></div>
        <div className="nameGrid">
          {HOUSEHOLD_NAMES.map((name, i) => {
            const selected = selectedNames.includes(name);
            return <button key={name} type="button" className={`participantToggle${selected ? " selected" : ""}`} aria-pressed={selected} onClick={() => togglePerson(name)}>
              <span className="participantCheck" aria-hidden="true">{selected ? "✓" : ""}</span>
              <span className="participantLabel">Person {i + 1}</span>
              <strong>{name}</strong>
            </button>;
          })}
        </div>
        <label><span>Who paid?</span><select value={payerName || ""} disabled={!selectedNames.length} onChange={(e) => setPayerName(e.target.value)}>
          {!selectedNames.length && <option value="">Select someone above</option>}
          {selectedNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select></label>
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
      <button className="primary big" disabled={busy || !items.length || !selectedNames.length} onClick={createTrip}>{busy && receipt ? "Creating…" : "Create trip & get share link"}</button>
      <p className="fineprint">No roommate accounts are required. Anyone with the trip link can update that trip, so treat the link like a small shared household link.</p>
    </div>
  );
}
