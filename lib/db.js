function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return { url: url.replace(/\/$/, ""), key };
}

async function request(path, options = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Database request failed (${response.status}): ${detail}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const db = {
  select(table, query = "") {
    return request(`${table}?${query}`, { method: "GET" });
  },
  insert(table, rows) {
    return request(table, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(rows)
    });
  },
  upsert(table, rows, conflict) {
    const suffix = conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : "";
    return request(`${table}${suffix}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(rows)
    });
  },
  update(table, query, values) {
    return request(`${table}?${query}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(values)
    });
  },
  delete(table, query) {
    return request(`${table}?${query}`, { method: "DELETE" });
  }
};

export async function loadTripByAccessKey(accessKey) {
  const trips = await db.select("trips", `access_key=eq.${encodeURIComponent(accessKey)}&select=*`);
  const trip = trips?.[0];
  if (!trip) return null;

  const [participants, items, selections] = await Promise.all([
    db.select("participants", `trip_id=eq.${trip.id}&select=*&order=sort_order.asc`),
    db.select("items", `trip_id=eq.${trip.id}&select=*&order=sort_order.asc`),
    db.select("selections", `trip_id=eq.${trip.id}&select=*`)
  ]);

  return { trip, participants, items, selections };
}
