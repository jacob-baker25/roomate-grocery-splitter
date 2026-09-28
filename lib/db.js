function config() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = secretKey || serviceRoleKey;
  if (!url || !key) {
    throw new Error("Database is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to the server environment, then redeploy.");
  }
  return { url: url.replace(/\/$/, ""), key, usesLegacyKey: !secretKey };
}

async function request(path, options = {}) {
  const { url, key, usesLegacyKey } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      apikey: key,
      ...(usesLegacyKey ? { Authorization: `Bearer ${key}` } : {}),
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

  const [participants, items, selections, groups] = await Promise.all([
    db.select("participants", `trip_id=eq.${trip.id}&select=*&order=sort_order.asc`),
    db.select("items", `trip_id=eq.${trip.id}&select=*&order=sort_order.asc`),
    db.select("selections", `trip_id=eq.${trip.id}&select=*`),
    trip.trip_group_id
      ? db.select("trip_groups", `id=eq.${trip.trip_group_id}&select=id,access_key`)
      : Promise.resolve([])
  ]);

  return { trip, participants, items, selections, tripGroup: groups?.[0] || null };
}

export async function loadTripGroupByAccessKey(accessKey) {
  const groups = await db.select("trip_groups", `access_key=eq.${encodeURIComponent(accessKey)}&select=*`);
  const tripGroup = groups?.[0];
  if (!tripGroup) return null;

  const trips = await db.select("trips", `trip_group_id=eq.${tripGroup.id}&select=*&order=created_at.desc`);
  const tripsWithParticipants = await Promise.all((trips || []).map(async (trip) => ({
    trip,
    participants: await db.select("participants", `trip_id=eq.${trip.id}&select=id,name,responded,sort_order&order=sort_order.asc`)
  })));

  return { tripGroup, trips: tripsWithParticipants };
}
