export async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.reason || `HTTP ${res.status}`);
  }
  return data;
}

export function fetchPlatforms() {
  return fetchJson("/api/platforms");
}

export function fetchStats(params = {}) {
  const qs = new URLSearchParams();
  if (params.since) qs.set("since", params.since);
  const suffix = qs.toString();
  return fetchJson(suffix ? `/api/stats?${suffix}` : "/api/stats");
}

export function fetchHistory(params) {
  const qs = new URLSearchParams(params);
  return fetchJson(`/api/history?${qs}`);
}

export function clearDb() {
  return fetchJson("/api/db/clear", { method: "POST" });
}

export function fetchDbMeta() {
  return fetchJson("/api/db");
}

export function fetchNotifications() {
  return fetchJson("/api/notifications");
}

export function fetchActions(params = {}) {
  const qs = new URLSearchParams(params);
  return fetchJson(`/api/actions?${qs}`);
}

export function fetchActionSummary() {
  return fetchJson("/api/actions/summary");
}

export function testWhatsApp() {
  return fetchJson("/api/notifications/test/whatsapp", { method: "POST" });
}

export function testFailAlert(preview = false) {
  const qs = preview ? "?preview=1" : "";
  return fetchJson(`/api/notifications/test/fail${qs}`, { method: "POST" });
}

export function previewDailyReport(params = {}) {
  const qs = new URLSearchParams({
    platform: params.platform || "facebook",
    ...(params.date ? { date: params.date } : {}),
  });
  return fetchJson(`/api/reports/daily?${qs}`, { method: "POST" });
}

export function sendDailyReport(params = {}) {
  const qs = new URLSearchParams({
    send: "1",
    channels: params.channels || "all",
    platform: params.platform || "facebook",
    ...(params.date ? { date: params.date } : {}),
  });
  return fetchJson(`/api/reports/daily?${qs}`, { method: "POST" });
}
