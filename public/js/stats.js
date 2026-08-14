import { fetchHistory, fetchStats } from "./api.js";
import { buildTimelineFromVisits, drawRatio, drawTimeline } from "./charts.js";
import { alertDialog } from "./dialog.js";
import { resolvePlatformClient } from "./platforms.js";
import { els, isMlEnabled, state } from "./state.js";
import { escapeHtml } from "./util.js";

export function populateProductFilter(products) {
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

export function renderStats(stats) {
  if (!stats) return;

  els.statTotal.textContent = String(stats.total ?? 0);
  els.statOk.textContent = String(stats.ok ?? 0);
  els.statFail.textContent = String(stats.fail ?? 0);
  els.statRate.textContent = `${stats.successRate ?? 0}%`;
  if (els.statMl) {
    els.statMl.textContent = !isMlEnabled()
      ? "—"
      : String(stats.byPlatform?.mercadolibre?.total ?? 0);
  }
  if (els.statFb) {
    els.statFb.textContent = String(stats.byPlatform?.facebook?.total ?? 0);
  }

  drawRatio(stats.ok || 0, stats.fail || 0);

  if (stats.timeline && Array.isArray(stats.timeline.labels)) {
    drawTimeline(stats.timeline);
  }

  populateProductFilter(
    stats.products || (stats.productStats || []).map((p) => p.product)
  );

  let failures = stats.recentFailures || [];
  if (!isMlEnabled()) {
    failures = failures.filter(
      (f) => resolvePlatformClient(f.platform, f.url) !== "mercadolibre"
    );
  }
  state.recentFailures = failures;
  if (els.copyFailsBtn) els.copyFailsBtn.disabled = !failures.length;

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

export async function loadActivityChart() {
  try {
    const stats = await fetchStats();
    if (stats.timeline?.labels?.length) {
      drawTimeline(stats.timeline);
      return;
    }

    const data = await fetchHistory({
      page: "1",
      limit: "500",
      range: "24h",
      status: "all",
    });
    drawTimeline(buildTimelineFromVisits(data.items || [], 30));
  } catch (err) {
    console.error("Error cargando actividad:", err);
  }
}

export async function loadStats() {
  try {
    renderStats(await fetchStats());
  } catch (err) {
    console.error("Error cargando stats:", err);
  }
}

function formatFailLogs(failures) {
  return failures
    .map((f, i) => {
      const plat = f.platform || "?";
      const err = f.error || "(sin detalle)";
      return [
        `#${i + 1} | id=${f.id} | ${plat} | ${f.product}`,
        `datetime: ${f.datetime}`,
        f.url ? `url: ${f.url}` : null,
        `error: ${err}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

export async function copyFailLogs() {
  const failures = state.recentFailures || [];
  if (!failures.length) return;

  const text = formatFailLogs(failures);
  const btn = els.copyFailsBtn;
  const prev = btn?.textContent;

  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      btn.textContent = "Copiado";
      setTimeout(() => {
        btn.textContent = prev || "Copiar fails";
      }, 1600);
    }
  } catch (err) {
    console.error("Clipboard:", err);
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      if (btn) {
        btn.textContent = "Copiado";
        setTimeout(() => {
          btn.textContent = prev || "Copiar fails";
        }, 1600);
      }
    } catch {
      alertDialog({
        title: "No se pudo copiar",
        message: "El navegador bloqueó el portapapeles. Probá de nuevo o copiá a mano.",
        tone: "danger",
      });
    }
    ta.remove();
  }
}
