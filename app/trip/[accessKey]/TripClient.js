"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "../../../lib/money.js";
import { allocateCentsByWeight } from "../../../lib/split.js";

export default function TripClient({ accessKey }) {
  const [data, setData] = useState(null);
  const [personId, setPersonId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(new Set());
  const [copied, setCopied] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [draftMode, setDraftMode] = useState("choice");
  const [draftWeights, setDraftWeights] = useState({});
  const [allocationSaving, setAllocationSaving] = useState(false);

  async function load(silent = false) {
    try {
      const response = await fetch(`/api/trips/${accessKey}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load trip.");
      setData(json);
      if (json.tripGroup?.access_key) localStorage.setItem("costco-splitter-trip-group", json.tripGroup.access_key);
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
    if (!data) return;
    if (personId && !data.participants.some((p) => p.id === personId)) {
      setPersonId(null);
      return;
    }
    if (!personId && data.tripGroup?.access_key) {
      const storedName = localStorage.getItem(`costco-splitter-person-name-${data.tripGroup.access_key}`);
      const savedName = storedName === "Gay Will" ? "Will" : storedName;
      const savedPerson = data.participants.find((person) => person.name === savedName);
      if (savedPerson) {
        setPersonId(savedPerson.id);
        localStorage.setItem(`costco-splitter-person-${accessKey}`, savedPerson.id);
      }
    }
  }, [accessKey, data, personId]);

  const me = data?.participants.find((p) => p.id === personId);
  const selectedSet = useMemo(() => new Set((data?.selections || []).filter((s) => s.participant_id === personId).map((s) => s.item_id)), [data, personId]);
  const allDone = data?.participants.every((p) => p.responded);
  const payer = data?.participants.find((p) => p.id === data?.trip.payer_participant_id);

  function choosePerson(id) {
    setPersonId(id);
    localStorage.setItem(`costco-splitter-person-${accessKey}`, id);
    const person = data?.participants.find((participant) => participant.id === id);
    if (person && data?.tripGroup?.access_key) {
      localStorage.setItem(`costco-splitter-person-name-${data.tripGroup.access_key}`, person.name);
    }
  }

  function openAllocationEditor(item) {
    const mode = item.split_mode || "choice";
    const weights = Object.fromEntries(data.participants.map((person) => {
      const selection = data.selections.find((entry) => entry.item_id === item.id && entry.participant_id === person.id);
      return [person.id, mode === "everyone" ? 1 : Number(selection?.weight || 0)];
    }));
    setEditingItemId(item.id);
    setDraftMode(mode);
    setDraftWeights(weights);
    setError("");
  }

  function changeDraftWeight(participantId, change) {
    setDraftWeights((current) => ({
      ...current,
      [participantId]: Math.min(99, Math.max(0, Number(current[participantId] || 0) + change))
    }));
  }

  async function saveAllocation(itemId) {
    setAllocationSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/trips/${accessKey}/allocation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: personId, itemId, mode: draftMode, weights: draftWeights })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not update the split.");
      setEditingItemId(null);
      await load();
    } catch (allocationError) {
      setError(allocationError.message);
    } finally {
      setAllocationSaving(false);
    }
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
    const url = data?.tripGroup?.access_key
      ? `${window.location.origin}/list/${data.tripGroup.access_key}`
      : window.location.href;
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
      <header className="hero compact"><div className="topline"><span className="eyebrow">COSTCO SPLIT</span>{data.tripGroup?.access_key && <a className="linkButton" href={`/list/${data.tripGroup.access_key}`}>All trips</a>}</div><h1>Who are you?</h1><p>Pick your name. No login required.</p></header>
      <section className="card stack">
        <div className="personPicker">{data.participants.map((p) => <button key={p.id} onClick={() => choosePerson(p.id)}><strong>{p.name}</strong><span>{p.responded ? "✓ Done" : "Not finished"}</span></button>)}</div>
      </section>
      <button className="secondary" onClick={share}>{copied ? "Link copied" : data.tripGroup ? "Share trip list" : "Share trip link"}</button>
    </div>
  );

  return (
    <div className="stack xl">
      <header className="hero compact">
        <div className="topline"><span className="eyebrow">{data.trip.store_name || "COSTCO"}</span><div className="topActions">{data.tripGroup?.access_key && <a className="linkButton" href={`/list/${data.tripGroup.access_key}`}>All trips</a>}<button className="linkButton" onClick={() => { setPersonId(null); localStorage.removeItem(`costco-splitter-person-${accessKey}`); if (data.tripGroup?.access_key) localStorage.removeItem(`costco-splitter-person-name-${data.tripGroup.access_key}`); }}>Switch person</button></div></div>
        <h1>Hey, {me.name}.</h1>
        <p>Tap every item you want to be part of. The price automatically divides among everyone who selects it.</p>
      </header>

      <div className="statusStrip">
        <div><span>Paid by</span><strong>{payer?.name}</strong></div>
        <div><span>Receipt</span><strong>{formatMoney(data.trip.receipt_total_cents)}</strong></div>
        <div><span>Responses</span><strong>{data.participants.filter((p) => p.responded).length}/{data.participants.length}</strong></div>
      </div>

      {error && <div className="error">{error}</div>}

      <section className="stack itemList">
        {data.items.map((item) => {
          const mode = item.split_mode || "choice";
          const itemSelections = data.participants.map((person) =>
            data.selections.find((selection) => selection.item_id === item.id && selection.participant_id === person.id)
          ).filter(Boolean);
          const participants = mode === "everyone"
            ? data.participants
            : itemSelections.map((selection) => data.participants.find((person) => person.id === selection.participant_id)).filter(Boolean);
          const selected = mode === "everyone" || selectedSet.has(item.id);
          const myShare = data.split.allocations?.[item.id]?.[personId];
          const totalWeight = itemSelections.reduce((sum, selection) => sum + Number(selection.weight || 1), 0);
          const splitDescription = mode === "everyone"
            ? "Everyone pays equally"
            : mode === "custom"
              ? `Custom ratio: ${itemSelections.map((selection) => {
                const participant = data.participants.find((person) => person.id === selection.participant_id);
                return `${participant?.name || "Unknown"} ${selection.weight || 1}/${totalWeight}`;
              }).join(", ")}`
              : participants.length
                ? `Split ${participants.length} way${participants.length === 1 ? "" : "s"}: ${participants.map((person) => person.name).join(", ")}`
                : "No one has claimed this yet";
          const canAdjust = mode !== "everyone" || me.id === payer?.id;
          const preview = editingItemId === item.id && draftMode === "custom"
            ? allocateCentsByWeight(data.participants, item.price_cents, draftWeights)
            : {};
          const draftTotal = Object.values(draftWeights).reduce((sum, weight) => sum + Number(weight || 0), 0);

          return <div className="itemBlock" key={item.id}>
            <button className={`itemCard ${selected ? "selected" : ""} ${mode !== "choice" ? "locked" : ""}`} disabled={saving.has(item.id) || mode !== "choice"} onClick={() => toggle(item.id, !selected)}>
              <span className="check">{selected ? "✓" : ""}</span>
              <span className="itemMain"><strong>{item.name}</strong><small>{splitDescription}{item.discount_cents > 0 ? ` · ${formatMoney(item.discount_cents)} discount applied` : ""}</small></span>
              <span className="itemPrice"><strong>{formatMoney(item.price_cents)}</strong><small>{selected && myShare != null ? `You: ${formatMoney(myShare)}` : ""}</small></span>
            </button>
            {canAdjust && <button className="allocationButton" onClick={() => editingItemId === item.id ? setEditingItemId(null) : openAllocationEditor(item)}>{editingItemId === item.id ? "Cancel" : mode === "custom" ? "Edit custom ratio" : "Adjust split"}</button>}

            {editingItemId === item.id && <div className="allocationEditor stack">
              <div className="allocationModes">
                <button className={draftMode === "choice" ? "active" : ""} onClick={() => setDraftMode("choice")}>Let people choose</button>
                {me.id === payer?.id && <button className={draftMode === "everyone" ? "active" : ""} onClick={() => setDraftMode("everyone")}>Everyone equally</button>}
                <button className={draftMode === "custom" ? "active" : ""} onClick={() => setDraftMode("custom")}>Custom ratio</button>
              </div>

              {draftMode === "custom" && <div className="weightList">
                {data.participants.map((person) => {
                  const weight = Number(draftWeights[person.id] || 0);
                  return <div className="weightRow" key={person.id}>
                    <span><strong>{person.name}</strong><small>{draftTotal ? `${weight}/${draftTotal} · ${formatMoney(preview[person.id] || 0)}` : "Not included"}</small></span>
                    <div className="stepper"><button aria-label={`Remove a share from ${person.name}`} onClick={() => changeDraftWeight(person.id, -1)} disabled={weight === 0}>−</button><strong>{weight}</strong><button aria-label={`Add a share to ${person.name}`} onClick={() => changeDraftWeight(person.id, 1)}>+</button></div>
                  </div>;
                })}
              </div>}

              <button className="primary" disabled={allocationSaving || (draftMode === "custom" && !draftTotal)} onClick={() => saveAllocation(item.id)}>{allocationSaving ? "Saving…" : "Save split"}</button>
            </div>}
          </div>;
        })}
      </section>

      <button className="primary big" onClick={markDone}>{me.responded ? "✓ You're marked done" : "I'm done choosing"}</button>
      {data.tripGroup?.access_key && <a className="secondary centerButton" href={`/list/${data.tripGroup.access_key}`}>Back to all trips</a>}
      {data.split.unclaimedCents > 0 && <div className="warningBox"><strong>{formatMoney(data.split.unclaimedCents)} is still unclaimed.</strong><span>That is okay while people are responding, but check it before sending Venmo requests.</span></div>}

      <section className="card stack">
        <div className="sectionTitle"><div><h2>{allDone ? "Everyone responded" : "Running totals"}</h2><p>These update as roommates make their selections.</p></div></div>
        <div className="totals">
          {data.participants.map((p) => <div key={p.id}><span><strong>{p.name}</strong><small>{p.id === payer?.id ? "Paid the Costco bill" : p.responded ? "Done" : "Waiting"}</small></span><strong>{formatMoney(data.split.totals[p.id] || 0)}</strong></div>)}
        </div>
        {allDone && data.split.unclaimedCents === 0 && <div className="successBox">Everything is assigned. {payer?.name} can request each non-payer for the amount shown above.</div>}
        <div className="buttonRow"><button className="secondary" onClick={share}>{data.tripGroup ? "Share trip list" : "Share link"}</button><button className="secondary" onClick={copyRequests}>{copied ? "Copied" : "Copy Venmo amounts"}</button></div>
      </section>

      <p className="fineprint">Penny remainders are assigned deterministically so every item adds back to its exact receipt price.</p>
    </div>
  );
}
