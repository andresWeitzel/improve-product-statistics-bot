export async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function fetchPlatforms() {
  return fetchJson("/api/platforms");
}

export function fetchStats() {
  return fetchJson("/api/stats");
}

export function fetchHistory(params) {
  const qs = new URLSearchParams(params);
  return fetchJson(`/api/history?${qs}`);
}

export function clearDb() {
  return fetchJson("/api/db/clear", { method: "POST" });
}
