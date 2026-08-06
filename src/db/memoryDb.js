import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { updateDateTime } from "../utils/dateTime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_FILE = path.join(DATA_DIR, "visits.json");
const MAX_VISITS = 5000;
const SAVE_DEBOUNCE_MS = 400;

/** Infere ML/FB desde URL o valor explícito. */
export function resolvePlatform(platform, url = "") {
  const p = String(platform || "").toLowerCase().trim();
  if (p === "facebook" || p === "fb") return "facebook";
  if (p === "mercadolibre" || p === "ml") return "mercadolibre";
  const u = String(url || "").toLowerCase();
  if (u.includes("facebook.com") || u.includes("fb.com")) return "facebook";
  if (u.includes("mercadolibre.") || u.includes("mercadolivre.") || u.includes("meli.")) {
    return "mercadolibre";
  }
  return "mercadolibre";
}

/**
 * Mini DB en memoria para visitas / fallos.
 * - Lecturas/escrituras en RAM
 * - Snapshot a disco (JSON) para no perder datos al reiniciar
 */
class MemoryDb {
  constructor() {
    this.nextId = 1;
    /** @type {Array<object>} más reciente primero */
    this.visits = [];
    this.counters = { total: 0, ok: 0, fail: 0 };
    /** @type {Map<string, { product: string, ok: number, fail: number, total: number, lastIso: string|null, lastError: string|null }>} */
    this.byProduct = new Map();
    this.startedAt = new Date().toISOString();
    this._saveTimer = null;
    this._dirty = false;

    this._load();
  }

  _ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  _load() {
    try {
      this._ensureDataDir();
      if (!fs.existsSync(DB_FILE)) {
        console.log("🧠 Memory DB vacía (sin archivo previo)");
        return;
      }
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      if (!parsed || !Array.isArray(parsed.visits)) return;

      this.nextId = Number(parsed.nextId) || 1;
      this.visits = parsed.visits.map((v) => ({
        ...v,
        platform: resolvePlatform(v.platform, v.url),
      }));
      this._rebuildIndexes();
      // Persistir backfill de platform si faltaba
      const needsSave = parsed.visits.some(
        (v, i) => v.platform !== this.visits[i].platform
      );
      if (needsSave) {
        this._dirty = true;
        this._flush();
        console.log("🧠 Memory DB: platform inferida/normalizada desde URLs");
      }
      console.log(
        `🧠 Memory DB cargada: ${this.counters.total} visitas (${this.counters.ok} ok / ${this.counters.fail} fail)`
      );
    } catch (err) {
      console.error("⚠️ Memory DB: no se pudo cargar:", err.message);
    }
  }

  _rebuildIndexes() {
    this.counters = { total: 0, ok: 0, fail: 0 };
    this.byProduct = new Map();

    for (const visit of this.visits) {
      this.counters.total += 1;
      if (visit.status === "ok") this.counters.ok += 1;
      else this.counters.fail += 1;
      this._bumpProduct(visit);
    }
  }

  _bumpProduct(visit) {
    let row = this.byProduct.get(visit.product);
    if (!row) {
      row = {
        product: visit.product,
        ok: 0,
        fail: 0,
        total: 0,
        lastIso: null,
        lastError: null,
      };
      this.byProduct.set(visit.product, row);
    }
    row.total += 1;
    if (visit.status === "ok") row.ok += 1;
    else {
      row.fail += 1;
      row.lastError = visit.error || row.lastError;
    }
    if (!row.lastIso || (visit.iso && visit.iso > row.lastIso)) {
      row.lastIso = visit.iso;
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
      const snapshot = {
        nextId: this.nextId,
        savedAt: new Date().toISOString(),
        visits: this.visits,
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(snapshot, null, 2), "utf8");
      this._dirty = false;
    } catch (err) {
      console.error("⚠️ Memory DB: no se pudo guardar:", err.message);
    }
  }

  /**
   * @param {{ status: "ok"|"fail", product: string, url: string, error?: string|null, platform?: string }} entry
   */
  insertVisit({ status, product, url, error = null, platform = null }) {
    const visit = {
      id: this.nextId++,
      status,
      product,
      url,
      platform: resolvePlatform(platform, url),
      datetime: updateDateTime(),
      iso: new Date().toISOString(),
      error: error || null,
    };

    this.visits.unshift(visit);
    this.counters.total += 1;
    if (status === "ok") this.counters.ok += 1;
    else this.counters.fail += 1;
    this._bumpProduct(visit);

    if (this.visits.length > MAX_VISITS) {
      const removed = this.visits.splice(MAX_VISITS);
      if (removed.length) this._rebuildIndexes();
    }

    this._scheduleSave();
    return visit;
  }

  getHistory({
    page = 1,
    limit = 15,
    status = "all",
    product = "",
    q = "",
    range = "all",
    date = "",
    hourFrom = "",
    hourTo = "",
    platform = "all",
  } = {}) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 15));
    const filter = String(status || "all").toLowerCase();
    const productFilter = String(product || "").trim();
    const query = String(q || "").trim().toLowerCase();
    const rangeFilter = String(range || "all").toLowerCase();
    const platformFilter = String(platform || "all").toLowerCase();
    const dayFilter = String(date || "").trim(); // YYYY-MM-DD
    const hFrom =
      hourFrom === "" || hourFrom == null ? null : Math.min(23, Math.max(0, Number(hourFrom)));
    const hTo =
      hourTo === "" || hourTo == null ? null : Math.min(23, Math.max(0, Number(hourTo)));

    const now = new Date();
    let minTs = null;
    let maxTs = null;

    if (rangeFilter === "15m") {
      minTs = now.getTime() - 15 * 60 * 1000;
    } else if (rangeFilter === "1h") {
      minTs = now.getTime() - 60 * 60 * 1000;
    } else if (rangeFilter === "6h") {
      minTs = now.getTime() - 6 * 60 * 60 * 1000;
    } else if (rangeFilter === "24h") {
      minTs = now.getTime() - 24 * 60 * 60 * 1000;
    } else if (rangeFilter === "7d") {
      minTs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    } else if (rangeFilter === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      minTs = start.getTime();
    } else if (rangeFilter === "yesterday") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 1);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      minTs = start.getTime();
      maxTs = end.getTime();
    }

    // Día concreto (date=YYYY-MM-DD) tiene prioridad sobre presets relativos
    // excepto si range=all y no hay date.

    let list = this.visits;
    if (filter === "ok" || filter === "fail") {
      list = list.filter((v) => v.status === filter);
    }
    if (platformFilter === "mercadolibre" || platformFilter === "facebook") {
      list = list.filter(
        (v) => resolvePlatform(v.platform, v.url) === platformFilter
      );
    }
    if (productFilter) {
      list = list.filter((v) => v.product === productFilter);
    }
    if (query) {
      list = list.filter(
        (v) =>
          v.product.toLowerCase().includes(query) ||
          (v.error && String(v.error).toLowerCase().includes(query)) ||
          String(v.id).includes(query)
      );
    }

    list = list.filter((v) => {
      if (!v.iso) return !dayFilter && minTs == null && hFrom == null && hTo == null;
      const ts = Date.parse(v.iso);
      if (Number.isNaN(ts)) return false;
      const d = new Date(ts);

      if (dayFilter) {
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (ymd !== dayFilter) return false;
      } else {
        if (minTs != null && ts < minTs) return false;
        if (maxTs != null && ts > maxTs) return false;
      }

      const hour = d.getHours();
      if (hFrom != null && hour < hFrom) return false;
      if (hTo != null && hour > hTo) return false;
      return true;
    });

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit) || 1);
    const currentPage = Math.min(safePage, totalPages);
    const start = (currentPage - 1) * safeLimit;

    const items = list.slice(start, start + safeLimit).map((v) => ({
      ...v,
      platform: resolvePlatform(v.platform, v.url),
    }));

    return {
      items,
      page: currentPage,
      limit: safeLimit,
      total,
      totalPages,
      status: filter,
      product: productFilter,
      q: query,
      range: rangeFilter,
      platform: platformFilter,
      date: dayFilter,
      hourFrom: hFrom,
      hourTo: hTo,
    };
  }

  /**
   * Buckets de actividad para el gráfico.
   * Usa 30 min si hay datos; si no, amplía hasta cubrir visitas recientes (máx 24h).
   */
  getTimeline() {
    const now = Date.now();
    const stamped = this.visits
      .map((v) => ({ ...v, ts: v.iso ? Date.parse(v.iso) : NaN }))
      .filter((v) => !Number.isNaN(v.ts));

    let windowMs = 30 * 60 * 1000;
    let start = now - windowMs;
    const inDefault = stamped.filter((v) => v.ts >= start);

    if (inDefault.length === 0 && stamped.length > 0) {
      const oldest = Math.min(...stamped.map((v) => v.ts));
      const span = Math.max(5 * 60 * 1000, now - oldest);
      windowMs = Math.min(span, 24 * 60 * 60 * 1000);
      start = now - windowMs;
    }

    let bucketMs = 60 * 1000;
    if (windowMs > 2 * 60 * 60 * 1000) bucketMs = 5 * 60 * 1000;
    if (windowMs > 8 * 60 * 60 * 1000) bucketMs = 15 * 60 * 1000;

    const bucketCount = Math.max(8, Math.ceil(windowMs / bucketMs));
    // Re-align start so buckets fill exactly
    start = now - bucketCount * bucketMs;

    const labels = [];
    const ok = Array(bucketCount).fill(0);
    const fail = Array(bucketCount).fill(0);

    for (let i = 0; i < bucketCount; i++) {
      const t = new Date(start + i * bucketMs);
      labels.push(
        t.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
      );
    }

    for (const visit of stamped) {
      if (visit.ts < start || visit.ts > now + bucketMs) continue;
      const idx = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((visit.ts - start) / bucketMs))
      );
      if (visit.status === "ok") ok[idx] += 1;
      else fail[idx] += 1;
    }

    const minutes = Math.round(windowMs / 60000);
    return {
      labels,
      ok,
      fail,
      minutes,
      bucketSec: bucketMs / 1000,
      totalInWindow: ok.reduce((a, b) => a + b, 0) + fail.reduce((a, b) => a + b, 0),
    };
  }

  getFailures({ limit = 20 } = {}) {
    return this.visits.filter((v) => v.status === "fail").slice(0, limit);
  }

  getStats() {
    const failures = this.getFailures({ limit: 20 });
    const successRate =
      this.counters.total === 0
        ? 0
        : Math.round((this.counters.ok / this.counters.total) * 1000) / 10;

    const productStats = [...this.byProduct.values()].sort(
      (a, b) => b.fail - a.fail || b.total - a.total
    );

    const products = productStats.map((p) => p.product);

    const byPlatform = { mercadolibre: { ok: 0, fail: 0, total: 0 }, facebook: { ok: 0, fail: 0, total: 0 } };
    for (const v of this.visits) {
      const key = resolvePlatform(v.platform, v.url);
      byPlatform[key].total += 1;
      if (v.status === "ok") byPlatform[key].ok += 1;
      else byPlatform[key].fail += 1;
    }

    return {
      total: this.counters.total,
      ok: this.counters.ok,
      fail: this.counters.fail,
      successRate,
      lastVisit: this.visits[0] || null,
      lastFailure: failures[0] || null,
      recentFailures: failures,
      productStats,
      products,
      byPlatform,
      timeline: this.getTimeline(),
      memory: {
        engine: "memory",
        startedAt: this.startedAt,
        maxVisits: MAX_VISITS,
        persisted: true,
        file: "data/visits.json",
        dirty: this._dirty,
      },
    };
  }

  getMeta() {
    return {
      engine: "memory",
      nextId: this.nextId,
      counts: { ...this.counters },
      productsTracked: this.byProduct.size,
      startedAt: this.startedAt,
      maxVisits: MAX_VISITS,
      file: DB_FILE,
      dirty: this._dirty,
    };
  }

  clear() {
    this.nextId = 1;
    this.visits = [];
    this.counters = { total: 0, ok: 0, fail: 0 };
    this.byProduct = new Map();
    this._dirty = true;
    this._flush();
    return this.getMeta();
  }
}

export const memoryDb = new MemoryDb();

// API compatible con el store anterior
export function recordVisit(entry) {
  return memoryDb.insertVisit(entry);
}

export function getHistory(opts) {
  return memoryDb.getHistory(opts);
}

export function getStats() {
  return memoryDb.getStats();
}

export function getDbMeta() {
  return memoryDb.getMeta();
}

export function clearDb() {
  return memoryDb.clear();
}
