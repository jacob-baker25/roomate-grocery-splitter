"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "../../../lib/money.js";

export default function TripClient({ accessKey }) {
  const [data, setData] = useState(null);
  const [personId, setPersonId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(new Set());
  const [copied, setCopied] = useState(false);

  async function load(silent = false) {
    try {
      const response = await fetch(`/api/trips/${accessKey}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load trip.");
      setData(json);
      if (!silent) setError("");
    } catch (e) {
      if (!silent) setError(e.message);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem(`costco-splitter-person-${accessKey}`);
    if (saved) setPersonId(saved);
    load();
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [accessKey]);

  useEffect(() => {
    if (data && personId && !data.participants.some((p) => p.id === personId)) setPersonId(null);
  }, [data, personId]);

  const me = data?.participants.find((p) => p.id === personId);
  const selectedSet = useMemo(() => new Set((data?.selections || []).filter((s) => s.participant_id === personId).map((s) => s.item_id)), [data, personId]);
  const allDone = data?.participants.every((p) => p.responded);
  const payer = data?.participants.find((p) => p.id === data?.trip.payer_participant_id);

  function choosePerson(id) {
    setPersonId(id);
    localStorage.setItem(`costco-splitter-person-${accessKey}`, id);
  }

  async function toggle(itemId, selected) {
    if (!personId) return;
    setSaving((current) => new Set(current).add(itemId));
    setData((current) => {
      if (!current) return current;
      const selections = current.selections.filter((s) => !(s.item_id === itemId && s.participant_id === personId));
      if (selected) selections.push({ trip_id: current.trip.id, item_id: itemId, participant_id: personId });
      const participants = current.participants.map((p) => p.id === personId ? { ...p, responded: false } : p);
      return { ...current, selections, participants };
    });
    try {
      const response = await fetch(`/api/trips/${accessKey}/selection`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: personId, itemId, selected }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not save.");
      await load(true);
    } catch (e) {
      setError(e.message);
      await load(true);
    } finally {
      setSaving((current) => { const next = new Set(current); next.delete(itemId); return next; });
    }
  }

  async function markDone() {
    const response = await fetch(`/api/trips/${accessKey}/done`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: personId }) });
    const json = await response.json();
    if (!response.ok) return setError(json.error || "Could not mark done.");
    await load();
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: "Costco split", url }); return; } catch {}
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function copyRequests() {
    if (!data) return;
    const lines = data.participants.filter((p) => p.id !== payer?.id).map((p) => `${p.name}: ${formatMoney(data.split.totals[p.id] || 0)}`);
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (error && !data) return <div className="card"><h1>Costco Splitter</h1><div className="error">{error}</div></div>;
  if (!data) return <div className="loading">Loading trip…</div>;

  if (!me) return (
    <div className="stack xl">
      <header className="hero compact"><span className="eyebrow">COSTCO SPLIT</span><h1>Who are you?</h1><p>Pick your name. No login required.</p></header>
      <section className="card stack">
        <div className="personPicker">{data.participants.map((p) => <button key={p.id} onClick={() => choosePerson(p.id)}><strong>{p.name}</strong><span>{p.responded ? "✓ Done" : "Not finished"}</span></button>)}</div>
      </section>
      <button className="secondary" onClick={share}>{copied ? "Link copied" : "Share trip link"}</button>
    </div>
  );

  return (
    <div className="stack xl">
      <header className="hero compact">
        <div className="topline"><span className="eyebrow">{data.trip.store_name || "COSTCO"}</span><button className="linkButton" onClick={() => { setPersonId(null); localStorage.removeItem(`costco-splitter-person-${accessKey}`); }}>Switch person</button></div>
        <h1>Hey, {me.name}.</h1>
        <p>Tap every item you want to be part of. The price automatically divides among everyone who selects it.</p>
      </header>

      <div className="statusStrip">
        <div><span>Paid by</span><strong>{payer?.name}</strong></div>
        <div><span>Receipt</span><strong>{formatMoney(data.trip.receipt_total_cents)}</strong></div>
        <div><span>Responses</span><strong>{data.participants.filter((p) => p.responded).length}/{data.participants.length}</strong></div>
      </div>

      <section className="stack itemList">
        {data.items.map((item) => {
          const selected = selectedSet.has(item.id);
          const participants = data.selections.filter((s) => s.item_id === item.id).map((s) => data.participants.find((p) => p.id === s.participant_id)).filter(Boolean);
          const myShare = data.split.allocations?.[item.id]?.[personId];
          return <button key={item.id} className={`itemCard ${selected ? "selected" : ""}`} disabled={saving.has(item.id)} onClick={() => toggle(item.id, !selected)}>
            <span className="check">{selected ? "✓" : ""}</span>
            <span className="itemMain"><strong>{item.name}</strong><small>{participants.length ? `Split ${participants.length} way${participants.length === 1 ? "" : "s"}: ${participants.map((p) => p.name).join(", ")}` : "No one has claimed this yet"}{item.discount_cents > 0 ? ` · ${formatMoney(item.discount_cents)} discount applied` : ""}</small></span>
            <span className="itemPrice"><strong>{formatMoney(item.price_cents)}</strong><small>{selected && myShare != null ? `You: ${formatMoney(myShare)}` : ""}</small></span>
          </button>;
        })}
      </section>

      <button className="primary big" onClick={markDone}>{me.responded ? "✓ You're marked done" : "I'm done choosing"}</button>
      {data.split.unclaimedCents > 0 && <div className="warningBox"><strong>{formatMoney(data.split.unclaimedCents)} is still unclaimed.</strong><span>That is okay while people are responding, but check it before sending Venmo requests.</span></div>}

      <section className="card stack">
        <div className="sectionTitle"><div><h2>{allDone ? "Everyone responded" : "Running totals"}</h2><p>These update as roommates make their selections.</p></div></div>
        <div className="totals">
          {data.participants.map((p) => <div key={p.id}><span><strong>{p.name}</strong><small>{p.id === payer?.id ? "Paid the Costco bill" : p.responded ? "Done" : "Waiting"}</small></span><strong>{formatMoney(data.split.totals[p.id] || 0)}</strong></div>)}
        </div>
        {allDone && data.split.unclaimedCents === 0 && <div className="successBox">Everything is assigned. {payer?.name} can request each non-payer for the amount shown above.</div>}
        <div className="buttonRow"><button className="secondary" onClick={share}>Share link</button><button className="secondary" onClick={copyRequests}>{copied ? "Copied" : "Copy Venmo amounts"}</button></div>
      </section>

      <p className="fineprint">Penny remainders are assigned deterministically so every item adds back to its exact receipt price.</p>
    </div>
  );
}
