import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { argentinaYmd } from "./memoryDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_FILE = path.join(DATA_DIR, "actions.json");
const MAX_ACTIONS = 2000;
const SAVE_DEBOUNCE_MS = 400;
const AR_TZ = "America/Argentina/Buenos_Aires";

const listeners = new Set();

export function onAction(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitAction(entry) {
  for (const fn of listeners) {
    try {
      fn(entry);
    } catch {
      // ignore listener errors
    }
  }
}

function formatAr(date = new Date()) {
  return date.toLocaleString("es-AR", { timeZone: AR_TZ });
}

function slim(value, depth = 0) {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 280);
  if (typeof value !== "object" || depth > 2) return undefined;
  if (Array.isArray(value)) return value.slice(0, 8).map((v) => slim(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (/pass|apikey|secret|token|auth/i.test(k)) continue;
    if (k === "whatsappPreview" || k === "preview") continue;
    if (k === "report" && v && typeof v === "object") {
      out.report = {
        dateYmd: v.dateYmd,
        platform: v.platform,
        total: v.total,
        ok: v.ok,
        fail: v.fail,
        successRate: v.successRate,
      };
      continue;
    }
    const next = slim(v, depth + 1);
    if (next !== undefined) out[k] = next;
  }
  return out;
}

function rangeBounds(range, dateYmd) {
  const now = new Date();
  let minTs = null;
  let maxTs = null;
  const r = String(range || "all").toLowerCase();

  if (r === "15m") minTs = now.getTime() - 15 * 60 * 1000;
  else if (r === "1h") minTs = now.getTime() - 60 * 60 * 1000;
  else if (r === "6h") minTs = now.getTime() - 6 * 60 * 60 * 1000;
  else if (r === "24h") minTs = now.getTime() - 24 * 60 * 60 * 1000;
  else if (r === "7d") minTs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  else if (r === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    minTs = start.getTime();
  } else if (r === "yesterday") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 1);
    minTs = start.getTime();
    maxTs = start.getTime() + 24 * 60 * 60 * 1000 - 1;
  }

  if (dateYmd) {
    minTs = null;
    maxTs = null;
  }

  return { minTs, maxTs, dayFilter: String(dateYmd || "").trim() };
}

class ActionsDb {
  constructor() {
    this.nextId = 1;
    /** @type {Array<object>} más reciente primero */
    this.actions = [];
    this._saveTimer = null;
    this._dirty = false;
    this._load();
  }

  _ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _load() {
    try {
      this._ensureDataDir();
      if (!fs.existsSync(DB_FILE)) return;
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      if (!parsed || !Array.isArray(parsed.actions)) return;
      this.nextId = Number(parsed.nextId) || 1;
      this.actions = parsed.actions;
      console.log(`🧠 Actions DB cargada: ${this.actions.length} eventos`);
    } catch (err) {
      console.error("⚠️ Actions DB: no se pudo cargar:", err.message);
    }
  }

  _scheduleSave() {
    this._dirty = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._flush();
    }, SAVE_DEBOUNCE_MS);
  }

  _flush() {
    if (!this._dirty) return;
    try {
      this._ensureDataDir();
      fs.writeFileSync(
        DB_FILE,
        JSON.stringify(
          {
            nextId: this.nextId,
            savedAt: new Date().toISOString(),
            actions: this.actions,
          },
          null,
          2
        ),
        "utf8"
      );
      this._dirty = false;
    } catch (err) {
      console.error("⚠️ Actions DB: no se pudo guardar:", err.message);
    }
  }

  insert(entry = {}) {
    const now = new Date();
    const row = {
      id: this.nextId++,
      iso: now.toISOString(),
      datetime: formatAr(now),
      type: entry.type || "test",
      kind: entry.kind || entry.type || "unknown",
      source: entry.source || "ui",
      channel: entry.channel || "none",
      status: entry.status || "fail",
      summary: String(entry.summary || "").slice(0, 220),
      product: entry.product || null,
      platform: entry.platform || null,
      detail: slim(entry.detail) || null,
    };

    this.actions.unshift(row);
    if (this.actions.length > MAX_ACTIONS) {
      this.actions.length = MAX_ACTIONS;
    }
    this._scheduleSave();
    emitAction(row);
    return row;
  }

  getHistory({
    page = 1,
    limit = 15,
    channel = "all",
    type = "all",
    status = "all",
    range = "all",
    date = "",
    q = "",
  } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 15));
    const channelFilter = String(channel || "all").toLowerCase();
    const typeFilter = String(type || "all").toLowerCase();
    const statusFilter = String(status || "all").toLowerCase();
    const query = String(q || "").trim().toLowerCase();
    const { minTs, maxTs, dayFilter } = rangeBounds(range, date);

    let list = this.actions;

    if (channelFilter === "whatsapp") {
      list = list.filter((a) => String(a.channel).includes("whatsapp"));
    } else if (channelFilter === "email") {
      list = list.filter((a) => String(a.channel).includes("email"));
    }

    if (typeFilter === "test" || typeFilter === "alert" || typeFilter === "report") {
      list = list.filter((a) => a.type === typeFilter);
    }

    if (statusFilter === "ok" || statusFilter === "queued" || statusFilter === "fail") {
      list = list.filter((a) => a.status === statusFilter);
    }

    if (query) {
      list = list.filter((a) => {
        const blob = `${a.summary} ${a.kind} ${a.source} ${a.product || ""} ${a.id}`;
        return blob.toLowerCase().includes(query);
      });
    }

    list = list.filter((a) => {
      if (!a.iso) return !dayFilter && minTs == null;
      const ts = Date.parse(a.iso);
      if (Number.isNaN(ts)) return false;
      if (dayFilter && argentinaYmd(new Date(ts)) !== dayFilter) return false;
      if (!dayFilter) {
        if (minTs != null && ts < minTs) return false;
        if (maxTs != null && ts > maxTs) return false;
      }
      return true;
    });

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit) || 1);
    const currentPage = Math.min(safePage, totalPages);
    const start = (currentPage - 1) * safeLimit;

    return {
      items: list.slice(start, start + safeLimit),
      page: currentPage,
      limit: safeLimit,
      total,
      totalPages,
      channel: channelFilter,
      type: typeFilter,
      status: statusFilter,
      range: String(range || "all"),
      date: dayFilter,
      q: query,
    };
  }

  getSummary() {
    const counts = { total: this.actions.length, ok: 0, queued: 0, fail: 0 };
    const byChannel = { whatsapp: 0, email: 0 };
    const byType = { test: 0, alert: 0, report: 0 };

    for (const a of this.actions) {
      if (a.status === "ok") counts.ok += 1;
      else if (a.status === "queued") counts.queued += 1;
      else counts.fail += 1;
      if (String(a.channel).includes("whatsapp")) byChannel.whatsapp += 1;
      if (String(a.channel).includes("email")) byChannel.email += 1;
      if (byType[a.type] != null) byType[a.type] += 1;
    }

    let fileBytes = 0;
    try {
      fileBytes = fs.statSync(DB_FILE).size;
    } catch {
      fileBytes = 0;
    }

    return {
      counts,
      byChannel,
      byType,
      lastWhatsApp: this.actions.find((a) => String(a.channel).includes("whatsapp")) || null,
      lastEmail: this.actions.find((a) => String(a.channel).includes("email")) || null,
      lastReport: this.actions.find((a) => a.type === "report") || null,
      lastAlert: this.actions.find((a) => a.type === "alert") || null,
      lastAction: this.actions[0] || null,
      fileRel: "data/actions.json",
      fileBytes,
      maxActions: MAX_ACTIONS,
    };
  }
}

const actionsDb = new ActionsDb();

export function recordAction(entry) {
  try {
    return actionsDb.insert(entry);
  } catch (err) {
    console.error("⚠️ Actions DB insert:", err.message);
    return null;
  }
}

export function getActionHistory(opts) {
  return actionsDb.getHistory(opts);
}

export function getActionSummary() {
  return actionsDb.getSummary();
}

export function recordWhatsAppTest(result, source = "ui") {
  const queued = Boolean(result?.queued);
  const ok = Boolean(result?.ok);
  return recordAction({
    type: "test",
    kind: "whatsapp-test",
    source,
    channel: "whatsapp",
    status: ok ? (queued ? "queued" : "ok") : "fail",
    summary: ok
      ? queued
        ? "Test WhatsApp encolado en CallMeBot"
        : "Test WhatsApp enviado"
      : `Test WhatsApp falló (${result?.reason || result?.error || "error"})`,
    detail: result,
  });
}

export function recordFailAlert(result, visit = {}, opts = {}) {
  const channel = result?.channel || "none";
  const queued = Boolean(result?.whatsapp?.queued);
  const sent = Boolean(result?.sent);
  let status = "fail";
  if (sent && queued && channel === "whatsapp") status = "queued";
  else if (sent) status = queued && !result?.email?.sent ? "queued" : "ok";
  else if (queued) status = "queued";

  const isTest = opts.source === "ui" || opts.type === "test";
  return recordAction({
    type: isTest ? "test" : "alert",
    kind: isTest ? "fail-test" : "fail-alert",
    source: opts.source || "bot",
    channel,
    status,
    product: visit.product || null,
    platform: visit.platform || null,
    summary: isTest
      ? `Prueba de alerta · ${channel}`
      : `Alerta de fallo · ${visit.product || "listing"} · ${channel}`,
    detail: {
      channel,
      whatsapp: result?.whatsapp,
      email: result?.email,
      error: visit.error || null,
    },
  });
}

export function recordDailyReport(result, opts = {}) {
  const emailSent = Boolean(result?.email?.sent);
  const waSent = Boolean(result?.whatsapp?.sent);
  const queued = Boolean(result?.whatsapp?.queued);
  const channel = emailSent && waSent
    ? "whatsapp+email"
    : emailSent
      ? "email"
      : waSent
        ? "whatsapp"
        : "none";
  const status = result?.sent
    ? queued && !emailSent
      ? "queued"
      : "ok"
    : "fail";
  const report = result?.report || {};
  const source = opts.source || (opts.force ? "ui" : "scheduler");

  return recordAction({
    type: "report",
    kind: "daily-report",
    source,
    channel,
    status,
    platform: report.platform || opts.platform || null,
    summary: `Reporte ${report.dateYmd || ""} · ${report.ok ?? 0} ok / ${report.fail ?? 0} fail · ${channel}`,
    detail: result,
  });
}
