"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "../../../lib/money.js";

function tripDate(receiptDate, createdAt) {
  const match = String(receiptDate || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match
    ? new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])))
    : new Date(createdAt);
}

function formatTripDate(receiptDate, createdAt) {
  const date = tripDate(receiptDate, createdAt);
  if (Number.isNaN(date.getTime())) return "Costco trip";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export default function TripListClient({ accessKey }) {
  const [trips, setTrips] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function load(silent = false) {
    try {
      const response = await fetch(`/api/trip-groups/${accessKey}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load trips.");
      setTrips(json.trips);
      localStorage.setItem("costco-splitter-trip-group", accessKey);
      if (!silent) setError("");
    } catch (loadError) {
      if (!silent) setError(loadError.message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [accessKey]);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: "Costco trips", url }); return; } catch {}
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (error && !trips) return <div className="card"><h1>Costco trips</h1><div className="error">{error}</div></div>;
  if (!trips) return <div className="loading">Loading trips…</div>;

  const sortedTrips = [...trips].sort((a, b) => tripDate(b.receiptDate, b.createdAt) - tripDate(a.receiptDate, a.createdAt));

  return <div className="stack xl">
    <header className="hero compact">
      <span className="eyebrow">SHARED HOUSEHOLD LIST</span>
      <h1>Costco trips</h1>
      <p>Choose a receipt to fill out. Your name will carry over as you move between trips.</p>
    </header>

    <section className="tripGrid">
      {sortedTrips.map((trip) => {
        const complete = trip.participantCount > 0 && trip.respondedCount === trip.participantCount;
        return <a className="tripCard" href={`/trip/${trip.accessKey}`} key={trip.accessKey}>
          <span className={`tripStatus${complete ? " complete" : ""}`}>{complete ? "Everyone done" : `${trip.respondedCount}/${trip.participantCount} responded`}</span>
          <h2>{formatTripDate(trip.receiptDate, trip.createdAt)}</h2>
          <div className="tripMeta"><span>{trip.storeName || "Costco"}</span><strong>{formatMoney(trip.receiptTotalCents)}</strong></div>
          <small>{trip.participantNames.join(", ")}</small>
        </a>;
      })}
      {!trips.length && <div className="card"><p>No trips have been added yet.</p></div>}
    </section>

    <div className="buttonRow">
      <a className="primary centerButton" href={`/?group=${encodeURIComponent(accessKey)}`}>Add another trip</a>
      <button className="secondary" onClick={share}>{copied ? "Link copied" : "Share trip list"}</button>
    </div>
    <p className="fineprint">Anyone with this private list link can open and update its trips.</p>
  </div>;
}
