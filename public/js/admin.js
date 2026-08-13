import { clearDb, fetchActionSummary, fetchDbMeta, fetchStats } from "./api.js";
import { alertDialog, confirmDialog } from "./dialog.js";
import {
  escapeHtml,
  formatArDate,
  formatBytes,
  formatDuration,
} from "./util.js";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function platLine(p) {
  if (!p) return "—";
  return `${p.total} total · ${p.ok} ok · ${p.fail} fail`;
}

function renderProducts(list) {
  const ul = document.getElementById("productStats");
  if (!ul) return;
  if (!list?.length) {
    ul.innerHTML = `<li class="muted">Sin productos todavía.</li>`;
    return;
  }
  ul.innerHTML = list
    .map((p) => {
      const total = p.total || 0;
      const okPct = total ? (p.ok / total) * 100 : 0;
      const failPct = total ? (p.fail / total) * 100 : 0;
      return `<li class="product-item">
        <div class="product-item__title">${escapeHtml(p.product)}</div>
        <div class="product-item__meta">${p.ok} ok · ${p.fail} fail · ${total} total</div>
        <div class="product-item__bars" aria-hidden="true">
          <span class="bar-ok" style="width:${okPct}%"></span>
          <span class="bar-fail" style="width:${failPct}%"></span>
        </div>
      </li>`;
    })
    .join("");
}

async function loadAdmin() {
  const [meta, stats, actions] = await Promise.all([
    fetchDbMeta(),
    fetchStats(),
    fetchActionSummary().catch(() => null),
  ]);
  const counts = meta.counts || {};

  setText("statVisits", String(meta.visitsInMemory ?? counts.total ?? 0));
  setText("statOk", String(counts.ok ?? 0));
  setText("statFail", String(counts.fail ?? 0));
  setText("statProducts", String(meta.productsTracked ?? 0));
  setText("statFile", formatBytes(meta.fileBytes));
  setText("statUptime", formatDuration(meta.uptimeMs));

  setText("metaEngine", meta.engine || "memory");
  setText("metaFile", meta.fileRel || meta.file || "data/visits.json");
  setText("metaDirty", meta.dirty ? "sí (hay cambios por guardar)" : "no");
  setText("metaMax", String(meta.maxVisits ?? 5000));
  setText("metaNextId", String(meta.nextId ?? "—"));
  setText("metaStarted", formatArDate(meta.startedAt));

  const oldest = meta.oldestVisit;
  const newest = meta.newestVisit;
  setText(
    "metaOldest",
    oldest ? `#${oldest.id} · ${oldest.product} · ${formatArDate(oldest.iso)}` : "—"
  );
  setText(
    "metaNewest",
    newest ? `#${newest.id} · ${newest.product} · ${formatArDate(newest.iso)}` : "—"
  );

  const by = stats.byPlatform || {};
  setText("platFb", platLine(by.facebook));
  setText("platMl", platLine(by.mercadolibre));

  const last = stats.lastVisit;
  setText(
    "lastVisit",
    last
      ? `Última visita: #${last.id} · ${last.product} · ${last.status} · ${formatArDate(last.iso)}`
      : "Última visita: —"
  );

  renderProducts(stats.productStats);

  if (actions) {
    const actionCounts = actions.counts || {};
    setText("actionsCount", String(actionCounts.total ?? 0));
    setText(
      "actionsChannels",
      `${actions.byChannel?.whatsapp ?? 0} WA · ${actions.byChannel?.email ?? 0} Gmail`
    );
    setText(
      "actionsLast",
      actions.lastAction
        ? `#${actions.lastAction.id} · ${actions.lastAction.summary}`
        : "—"
    );
  }
}

document.getElementById("refreshBtn")?.addEventListener("click", () => {
  loadAdmin().catch((err) =>
    alertDialog({
      title: "No se pudo actualizar",
      message: err.message || String(err),
      tone: "danger",
    })
  );
});

document.getElementById("clearDbBtn")?.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Vaciar historial de visitas",
    message:
      "Se borran todos los registros de visitas en memoria y se reescribe data/visits.json.\nNo se puede deshacer. El historial de acciones (Gmail/WhatsApp) no se toca.",
    confirmLabel: "Vaciar historial",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await clearDb();
    await loadAdmin();
  } catch (err) {
    await alertDialog({
      title: "Error al vaciar",
      message: err.message || "No se pudo limpiar el historial",
      tone: "danger",
    });
  }
});

loadAdmin().catch((err) => {
  alertDialog({
    title: "Error al cargar",
    message: err.message || String(err),
    tone: "danger",
  });
});
