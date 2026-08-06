const PAGE_SIZE = 15;

const state = {
  page: 1,
  totalPages: 1,
  status: "all",
  range: "all",
  date: "",
  hourFrom: "",
  hourTo: "",
  product: "",
  q: "",
  historyReq: 0,
  refreshTimer: null,
  searchTimer: null,
  productListKey: "",
};

const els = {
  conn: document.getElementById("connectionStatus"),
  clearDbBtn: document.getElementById("clearDbBtn"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  tbody: document.getElementById("statusContainer"),
  empty: document.getElementById("historyEmpty"),
  pageInfo: document.getElementById("pageInfo"),
  prev: document.getElementById("prevPage"),
  next: document.getElementById("nextPage"),
  productFilter: document.getElementById("productFilter"),
  searchFilter: document.getElementById("searchFilter"),
  dateFilter: document.getElementById("dateFilter"),
  hourFromFilter: document.getElementById("hourFromFilter"),
  hourToFilter: document.getElementById("hourToFilter"),
  statTotal: document.getElementById("statTotal"),
  statOk: document.getElementById("statOk"),
  statFail: document.getElementById("statFail"),
  statRate: document.getElementById("statRate"),
  failList: document.getElementById("failList"),
  lastFailMeta: document.getElementById("lastFailMeta"),
  productStats: document.getElementById("productStats"),
  timelineChart: document.getElementById("timelineChart"),
  timelineEmpty: document.getElementById("timelineEmpty"),
  timelineTitle: document.getElementById("timelineTitle"),
  ratioChart: document.getElementById("ratioChart"),
};

const socket = io();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fillHourSelects() {
  const opts = ['<option value="">--</option>'];
  for (let h = 0; h < 24; h++) {
    opts.push(`<option value="${h}">${pad2(h)}:00</option>`);
  }
  const html = opts.join("");
  if (els.hourFromFilter) els.hourFromFilter.innerHTML = html;
  if (els.hourToFilter) els.hourToFilter.innerHTML = html;
}

function setConnection(kind, text) {
  els.conn.className = `conn conn--${kind}`;
  els.conn.innerHTML = `<span class="conn__dot" aria-hidden="true"></span><span class="conn__text">${escapeHtml(text)}</span>`;
}

function setRangeActive(range) {
  document.querySelectorAll(".filter[data-range]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.range === range);
  });
}

function sizeCanvas(canvas) {
  const parent = canvas.parentElement;
  const cssW = Math.max(1, parent.clientWidth || 300);
  const cssH = Math.max(1, parent.clientHeight || 220);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: cssW, height: cssH };
}

/** Construye buckets de actividad desde visitas (cliente). */
function buildTimelineFromVisits(visits, minutes = 30) {
  const now = Date.now();
  const stamped = (visits || [])
    .map((v) => ({ ...v, ts: v.iso ? Date.parse(v.iso) : NaN }))
    .filter((v) => !Number.isNaN(v.ts));

  let windowMs = minutes * 60 * 1000;
  let start = now - windowMs;
  const inWindow = stamped.filter((v) => v.ts >= start);

  if (inWindow.length === 0 && stamped.length > 0) {
    const oldest = Math.min(...stamped.map((v) => v.ts));
    windowMs = Math.min(Math.max(now - oldest, 5 * 60 * 1000), 24 * 60 * 60 * 1000);
    start = now - windowMs;
  }

  let bucketMs = 60 * 1000;
  if (windowMs > 2 * 60 * 60 * 1000) bucketMs = 5 * 60 * 1000;
  if (windowMs > 8 * 60 * 60 * 1000) bucketMs = 15 * 60 * 1000;

  const bucketCount = Math.max(8, Math.ceil(windowMs / bucketMs));
  start = now - bucketCount * bucketMs;

  const labels = [];
  const ok = Array(bucketCount).fill(0);
  const fail = Array(bucketCount).fill(0);

  for (let i = 0; i < bucketCount; i++) {
    const t = new Date(start + i * bucketMs);
    labels.push(t.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }));
  }

  for (const v of stamped) {
    if (v.ts < start) continue;
    const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((v.ts - start) / bucketMs)));
    if (v.status === "ok") ok[idx] += 1;
    else fail[idx] += 1;
  }

  return {
    labels,
    ok,
    fail,
    minutes: Math.round(windowMs / 60000),
    totalInWindow: ok.reduce((a, b) => a + b, 0) + fail.reduce((a, b) => a + b, 0),
  };
}

function drawTimeline(timeline) {
  if (!els.timelineChart) return;
  const { ctx, width, height } = sizeCanvas(els.timelineChart);
  ctx.clearRect(0, 0, width, height);

  const labels = timeline?.labels || [];
  const ok = timeline?.ok || [];
  const fail = timeline?.fail || [];
  const total = (timeline?.totalInWindow ?? 0) || ok.reduce((a, b) => a + b, 0) + fail.reduce((a, b) => a + b, 0);

  if (els.timelineTitle) {
    const mins = timeline?.minutes || 30;
    els.timelineTitle.textContent = `Actividad (últimos ${mins} min · ${total} visitas)`;
  }

  if (!labels.length || total === 0) {
    els.timelineEmpty?.classList.remove("hidden");
    return;
  }
  els.timelineEmpty?.classList.add("hidden");

  const pad = { top: 16, right: 12, bottom: 36, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxVal = Math.max(1, ...ok.map((v, i) => v + fail[i]));
  const gap = 2;
  const barW = Math.max(2, plotW / labels.length - gap);

  // grid
  ctx.strokeStyle = "rgba(232,238,245,0.08)";
  ctx.fillStyle = "#8b9aab";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= 3; i++) {
    const y = pad.top + (plotH * i) / 3;
    const val = Math.round(maxVal * (1 - i / 3));
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(String(val), pad.left - 6, y + 3);
  }

  for (let i = 0; i < labels.length; i++) {
    const x = pad.left + i * (barW + gap);
    const okH = (ok[i] / maxVal) * plotH;
    const failH = (fail[i] / maxVal) * plotH;
    const base = pad.top + plotH;

    if (okH > 0) {
      ctx.fillStyle = "#3dba7c";
      ctx.fillRect(x, base - okH, barW, okH);
    }
    if (failH > 0) {
      ctx.fillStyle = "#e86a5c";
      ctx.fillRect(x, base - okH - failH, barW, failH);
    }
  }

  // x labels (sparse)
  ctx.fillStyle = "#8b9aab";
  ctx.textAlign = "center";
  const step = Math.max(1, Math.ceil(labels.length / 8));
  for (let i = 0; i < labels.length; i += step) {
    const x = pad.left + i * (barW + gap) + barW / 2;
    ctx.fillText(labels[i], x, height - 12);
  }

  // legend
  ctx.textAlign = "left";
  ctx.fillStyle = "#3dba7c";
  ctx.fillRect(pad.left, 4, 8, 8);
  ctx.fillStyle = "#8b9aab";
  ctx.fillText("OK", pad.left + 12, 11);
  ctx.fillStyle = "#e86a5c";
  ctx.fillRect(pad.left + 48, 4, 8, 8);
  ctx.fillStyle = "#8b9aab";
  ctx.fillText("Fallos", pad.left + 60, 11);
}

function drawRatio(ok, fail) {
  if (!els.ratioChart) return;
  const { ctx, width, height } = sizeCanvas(els.ratioChart);
  ctx.clearRect(0, 0, width, height);

  const total = (ok || 0) + (fail || 0);
  const cx = width / 2;
  const cy = height / 2 - 8;
  const r = Math.min(width, height) * 0.32;
  const thickness = r * 0.42;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(232,238,245,0.15)";
    ctx.lineWidth = thickness;
    ctx.stroke();
  } else {
    const okAngle = (ok / total) * Math.PI * 2;
    let start = -Math.PI / 2;
    ctx.lineWidth = thickness;
    ctx.lineCap = "butt";

    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + okAngle);
    ctx.strokeStyle = "#3dba7c";
    ctx.stroke();

    start += okAngle;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + Math.PI * 2 - okAngle);
    ctx.strokeStyle = "#e86a5c";
    ctx.stroke();
  }

  ctx.fillStyle = "#e8eef5";
  ctx.font = "600 18px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(total), cx, cy - 2);
  ctx.fillStyle = "#8b9aab";
  ctx.font = "10px IBM Plex Mono, monospace";
  ctx.fillText("total", cx, cy + 16);

  ctx.font = "11px Outfit, sans-serif";
  ctx.fillStyle = "#3dba7c";
  ctx.fillText(`OK ${ok || 0}`, cx - 40, height - 14);
  ctx.fillStyle = "#e86a5c";
  ctx.fillText(`Fail ${fail || 0}`, cx + 40, height - 14);
}

function populateProductFilter(products) {
  if (!els.productFilter || !Array.isArray(products)) return;
  const key = products.join("|");
  if (key === state.productListKey) return;
  state.productListKey = key;
  const current = state.product;
  els.productFilter.innerHTML = [`<option value="">Todos los productos</option>`]
    .concat(
      products.map(
        (p) =>
          `<option value="${escapeHtml(p)}" ${p === current ? "selected" : ""}>${escapeHtml(p)}</option>`
      )
    )
    .join("");
}

function renderHistory(payload) {
  const items = payload.items || [];
  state.page = payload.page || 1;
  state.totalPages = payload.totalPages || 1;

  els.tbody.innerHTML = items
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>
          <span class="status-cell">
            <span class="lamp ${row.status === "ok" ? "ok" : "fail"}"></span>
            <span class="status-text">${row.status === "ok" ? "ok" : "fail"}</span>
          </span>
        </td>
        <td><a href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.product)}</a></td>
        <td>${escapeHtml(row.datetime)}</td>
      </tr>`
    )
    .join("");

  els.empty.classList.toggle("hidden", items.length > 0);
  els.pageInfo.textContent = `Página ${state.page} / ${state.totalPages} · ${payload.total || 0} registros`;
  els.prev.disabled = state.page <= 1;
  els.next.disabled = state.page >= state.totalPages;
}

function renderStats(stats) {
  if (!stats) return;

  els.statTotal.textContent = String(stats.total ?? 0);
  els.statOk.textContent = String(stats.ok ?? 0);
  els.statFail.textContent = String(stats.fail ?? 0);
  els.statRate.textContent = `${stats.successRate ?? 0}%`;

  drawRatio(stats.ok || 0, stats.fail || 0);

  if (stats.timeline && Array.isArray(stats.timeline.labels)) {
    drawTimeline(stats.timeline);
  }

  populateProductFilter(stats.products || (stats.productStats || []).map((p) => p.product));

  const failures = stats.recentFailures || [];
  if (!failures.length) {
    els.lastFailMeta.textContent = "Sin fallos registrados.";
    els.failList.innerHTML = "";
  } else {
    const last = stats.lastFailure;
    els.lastFailMeta.textContent = last
      ? `Último fallo: ${last.product} · ${last.datetime}`
      : "Hay fallos registrados.";
    els.failList.innerHTML = failures
      .map(
        (f) => `
        <li class="fail-item">
          <div class="fail-item__title">
            <span>${escapeHtml(f.product)}</span>
            <span class="badge">#${escapeHtml(f.id)}</span>
          </div>
          <div class="fail-item__time">${escapeHtml(f.datetime)}</div>
          ${f.error ? `<div class="fail-item__error">${escapeHtml(f.error)}</div>` : ""}
        </li>`
      )
      .join("");
  }

  const products = stats.productStats || [];
  els.productStats.innerHTML = products.length
    ? products
        .map((p) => {
          const okPct = p.total ? (p.ok / p.total) * 100 : 0;
          const failPct = p.total ? (p.fail / p.total) * 100 : 0;
          return `
            <li class="product-item">
              <div class="product-item__title">
                <span>${escapeHtml(p.product)}</span>
                <span class="badge">${p.fail} fallos</span>
              </div>
              <div class="product-item__meta">${p.ok} ok · ${p.fail} fail · ${p.total} total</div>
              <div class="product-item__bars" aria-hidden="true">
                <span class="bar-ok" style="width:${okPct}%"></span>
                <span class="bar-fail" style="width:${failPct}%"></span>
              </div>
            </li>`;
        })
        .join("")
    : `<li class="product-item"><div class="product-item__meta">Sin datos aún.</div></li>`;
}

async function loadActivityChart() {
  try {
    // Prefer server timeline if available
    const statsRes = await fetch("/api/stats");
    if (statsRes.ok) {
      const stats = await statsRes.json();
      if (stats.timeline?.labels?.length) {
        drawTimeline(stats.timeline);
        return;
      }
    }

    // Fallback: construir desde historial reciente
    const res = await fetch("/api/history?page=1&limit=500&range=24h&status=all");
    if (!res.ok) return;
    const data = await res.json();
    drawTimeline(buildTimelineFromVisits(data.items || [], 30));
  } catch (err) {
    console.error("Error cargando actividad:", err);
  }
}

async function clearMemoryDb() {
  if (!confirm("¿Vaciar todo el historial de visitas?")) return;
  try {
    const res = await fetch("/api/db/clear", { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.page = 1;
    await Promise.all([loadHistory(), loadStats(), loadActivityChart()]);
  } catch (err) {
    console.error("Error limpiando historial:", err);
    alert("No se pudo limpiar el historial");
  }
}

function resetFilters() {
  state.status = "all";
  state.range = "all";
  state.date = "";
  state.hourFrom = "";
  state.hourTo = "";
  state.product = "";
  state.q = "";
  state.page = 1;

  document.querySelectorAll(".filter[data-status]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.status === "all");
  });
  setRangeActive("all");
  if (els.dateFilter) els.dateFilter.value = "";
  if (els.hourFromFilter) els.hourFromFilter.value = "";
  if (els.hourToFilter) els.hourToFilter.value = "";
  if (els.productFilter) els.productFilter.value = "";
  if (els.searchFilter) els.searchFilter.value = "";
  loadHistory();
}

async function loadHistory() {
  const reqId = ++state.historyReq;
  try {
    const params = new URLSearchParams({
      page: String(state.page),
      limit: String(PAGE_SIZE),
      status: state.status,
      range: state.date ? "all" : state.range,
      product: state.product,
      q: state.q,
      date: state.date,
      hourFrom: state.hourFrom,
      hourTo: state.hourTo,
    });
    const res = await fetch(`/api/history?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (reqId !== state.historyReq) return; // respuesta vieja
    renderHistory(data);
  } catch (err) {
    console.error("Error cargando historial:", err);
  }
}

async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderStats(await res.json());
  } catch (err) {
    console.error("Error cargando stats:", err);
  }
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => {
    if (state.page === 1) loadHistory();
    loadStats();
    loadActivityChart();
  }, 350);
}

document.querySelectorAll(".filter[data-status]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter[data-status]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.status = btn.dataset.status;
    state.page = 1;
    loadHistory();
  });
});

document.querySelectorAll(".filter[data-range]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setRangeActive(btn.dataset.range);
    state.range = btn.dataset.range;
    state.date = "";
    if (els.dateFilter) els.dateFilter.value = "";
    state.page = 1;
    loadHistory();
  });
});

if (els.dateFilter) {
  els.dateFilter.addEventListener("change", () => {
    state.date = els.dateFilter.value || "";
    if (state.date) {
      state.range = "all";
      setRangeActive("all");
    }
    state.page = 1;
    loadHistory();
  });
}

if (els.hourFromFilter) {
  els.hourFromFilter.addEventListener("change", () => {
    state.hourFrom = els.hourFromFilter.value;
    state.page = 1;
    loadHistory();
  });
}

if (els.hourToFilter) {
  els.hourToFilter.addEventListener("change", () => {
    state.hourTo = els.hourToFilter.value;
    state.page = 1;
    loadHistory();
  });
}

if (els.productFilter) {
  els.productFilter.addEventListener("change", () => {
    state.product = els.productFilter.value;
    state.page = 1;
    loadHistory();
  });
}

if (els.searchFilter) {
  els.searchFilter.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      state.q = els.searchFilter.value.trim();
      state.page = 1;
      loadHistory();
    }, 250);
  });
}

if (els.clearDbBtn) els.clearDbBtn.addEventListener("click", clearMemoryDb);
if (els.clearFiltersBtn) els.clearFiltersBtn.addEventListener("click", resetFilters);

els.prev.addEventListener("click", () => {
  if (state.page <= 1) return;
  state.page -= 1;
  loadHistory();
});

els.next.addEventListener("click", () => {
  if (state.page >= state.totalPages) return;
  state.page += 1;
  loadHistory();
});

socket.on("connect", () => {
  setConnection("ok", "Conectado");
  loadHistory();
  loadStats();
  loadActivityChart();
});

socket.on("disconnect", () => {
  setConnection("fail", "Desconectado");
});

socket.on("stats", (stats) => {
  renderStats(stats);
  if (!stats?.timeline) loadActivityChart();
});

socket.on("update", () => {
  scheduleRefresh();
});

window.addEventListener("resize", () => {
  loadActivityChart();
  loadStats();
});

fillHourSelects();
loadHistory();
loadStats();
loadActivityChart();
