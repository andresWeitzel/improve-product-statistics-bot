import {
  fetchActionSummary,
  fetchActions,
  fetchNotifications,
  previewDailyReport,
  sendDailyReport,
  testFailAlert,
  testWhatsApp,
} from "./api.js";
import { confirmDialog } from "./dialog.js";
import { escapeHtml } from "./util.js";

const PAGE_SIZE = 15;
const resultLog = document.getElementById("resultLog");
const resultBanner = document.getElementById("resultBanner");
const resultPill = document.getElementById("resultPill");
const resultDetails = document.getElementById("resultDetails");
const conn = document.getElementById("actionsConn");
const tbody = document.getElementById("actionRows");
const empty = document.getElementById("actionEmpty");

const buttons = {
  waTest: document.getElementById("btnWaTest"),
  failPreview: document.getElementById("btnFailPreview"),
  failTest: document.getElementById("btnFailTest"),
  reportPreview: document.getElementById("btnReportPreview"),
  reportEmail: document.getElementById("btnReportEmail"),
  reportWa: document.getElementById("btnReportWa"),
  reportAll: document.getElementById("btnReportAll"),
};

const secrets = {
  mail: { full: "", masked: "", shown: false },
  phone: { full: "", masked: "", shown: false },
};

const filters = {
  page: 1,
  totalPages: 1,
  channel: "all",
  type: "all",
  status: "all",
  range: "all",
  date: "",
  q: "",
  searchTimer: null,
  req: 0,
};

const TYPE_LABEL = { test: "Test", alert: "Alerta", report: "Reporte" };
const SOURCE_LABEL = { ui: "Panel", bot: "Bot", scheduler: "Agenda" };
const CHANNEL_LABEL = {
  whatsapp: "WhatsApp",
  email: "Gmail",
  "whatsapp+email": "WA + Gmail",
  none: "—",
};
const STATUS_LABEL = { ok: "ok", queued: "encolado", fail: "fallo" };

function setConn(kind, text) {
  if (!conn) return;
  conn.className = `conn conn--${kind}`;
  conn.innerHTML = `<span class="conn__dot" aria-hidden="true"></span><span class="conn__text">${text}</span>`;
}

function setBusy(busy) {
  for (const btn of Object.values(buttons)) {
    if (btn) btn.disabled = busy || btn.dataset.locked === "1";
  }
}

function setBtnEnabled(btn, enabled) {
  if (!btn) return;
  btn.dataset.locked = enabled ? "0" : "1";
  btn.disabled = !enabled;
  btn.title = enabled ? "" : "Canal no configurado";
}

function pill(el, kind, text) {
  if (!el) return;
  el.className = `pill${kind ? ` pill--${kind}` : ""}`;
  el.textContent = text;
}

function statusTone(status) {
  if (status === "ok") return "ok";
  if (status === "queued") return "warn";
  if (status === "fail") return "off";
  return "";
}

function yn(v) {
  return v ? "sí" : "no";
}

function formatPhone(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("549") && d.length >= 12) {
    const rest = d.slice(3);
    return `+54 9 ${rest.slice(0, 2)} ${rest.slice(2, 6)}-${rest.slice(6)}`;
  }
  return `+${d}`;
}

function formatPhoneMasked(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return "";
  const last = d.slice(-4);
  if (d.startsWith("549") && d.length >= 12) {
    const area = d.slice(3, 5);
    return `+54 9 ${area} ••••-${last}`;
  }
  return `••••${last}`;
}

function arTime(isoOrMs) {
  if (!isoOrMs) return "—";
  const d = new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderSecret(kind) {
  const item = secrets[kind];
  const valueEl = document.getElementById(kind === "mail" ? "mailTo" : "waPhone");
  const btn = document.getElementById(kind === "mail" ? "toggleMail" : "togglePhone");
  if (!valueEl || !btn) return;
  if (!item.full && !item.masked) {
    valueEl.textContent = "—";
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.textContent = item.shown ? "Ocultar" : "Mostrar";
  btn.setAttribute("aria-pressed", item.shown ? "true" : "false");
  if (kind === "phone") {
    valueEl.textContent = item.shown
      ? formatPhone(item.full) || item.full
      : item.masked || formatPhoneMasked(item.full);
  } else {
    valueEl.textContent = item.shown ? item.full : item.masked || "••••";
  }
}

function bindSecretToggle(kind, btnId) {
  document.getElementById(btnId)?.addEventListener("click", () => {
    secrets[kind].shown = !secrets[kind].shown;
    renderSecret(kind);
  });
}

function summarize(data) {
  if (!data || typeof data !== "object") {
    return { tone: "", title: String(data ?? "") };
  }
  if (data.error) return { tone: "off", title: data.error };
  if (data.kind === "whatsapp-test") {
    if (data.ok && data.queued) {
      return { tone: "warn", title: "CallMeBot encoló el test. No cuentes con que llegue ahora." };
    }
    if (data.ok) return { tone: "ok", title: "Test de WhatsApp enviado. Revisá el chat." };
    if (data.reason === "rateLimited") {
      return { tone: "warn", title: "WhatsApp en cooldown. Evitá más tests un rato." };
    }
    return { tone: "off", title: `No se envió el test (${data.reason || data.body || "error"}).` };
  }
  if (data.kind === "fail-test") {
    if (data.reason === "dryRun" || data.preview) {
      return { tone: "", title: "Vista previa de la alerta. No se envió nada." };
    }
    if (data.channel === "whatsapp") {
      return { tone: "ok", title: "Alerta enviada por WhatsApp (llegó al instante)." };
    }
    if (data.channel === "email") {
      return { tone: "warn", title: "WhatsApp no fue confiable. Alerta enviada por Gmail." };
    }
    if (data.channel === "whatsapp+email") {
      return { tone: "ok", title: "Alerta enviada por WhatsApp y Gmail." };
    }
    return { tone: "off", title: "La alerta no salió por ningún canal." };
  }
  if (data.preview && data.report) {
    const r = data.report;
    return {
      tone: "",
      title: `Vista previa ${r.dateYmd || ""} · total ${r.total} · ok ${r.ok} · fallos ${r.fail} · ${r.successRate}%`,
    };
  }
  if (data.channels) {
    const mail = data.email?.sent ? "Gmail sí" : "Gmail no";
    const wa = data.whatsapp?.sent
      ? data.whatsapp.queued
        ? "WhatsApp encolado"
        : "WhatsApp sí"
      : "WhatsApp no";
    return { tone: data.sent ? "ok" : "off", title: `Reporte: ${mail} · ${wa}.` };
  }
  return { tone: "", title: "Listo." };
}

function showResult(data, running = false) {
  const summary = running
    ? { tone: "", title: typeof data === "string" ? data : "Ejecutando…" }
    : summarize(data);

  resultBanner.classList.toggle("muted", running || !summary.tone);
  resultBanner.textContent = summary.title;
  pill(
    resultPill,
    running ? "" : summary.tone || "",
    running ? "…" : summary.tone === "ok" ? "ok" : summary.tone === "warn" ? "aviso" : summary.tone === "off" ? "error" : "listo"
  );

  if (running) {
    resultDetails?.classList.add("hidden");
    return;
  }

  resultLog.textContent =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  resultDetails?.classList.remove("hidden");
}

function renderLast(elText, elPill, event) {
  if (!event) {
    elText.textContent = "Sin envíos todavía.";
    elText.classList.add("muted");
    pill(elPill, "", "—");
    return;
  }
  elText.classList.remove("muted");
  elText.textContent = `${event.summary} · ${event.datetime}`;
  pill(elPill, statusTone(event.status), STATUS_LABEL[event.status] || event.status);
}

function renderLog(data) {
  const items = data.items || [];
  filters.page = data.page || 1;
  filters.totalPages = data.totalPages || 1;

  tbody.innerHTML = items
    .map((row) => {
      const lamp =
        row.status === "ok" ? "ok" : row.status === "queued" ? "warn" : "fail";
      return `<tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(TYPE_LABEL[row.type] || row.type)}</td>
        <td>${escapeHtml(CHANNEL_LABEL[row.channel] || row.channel)}</td>
        <td>
          <span class="status-cell">
            <span class="lamp ${lamp}"></span>
            <span class="status-text">${escapeHtml(STATUS_LABEL[row.status] || row.status)}</span>
          </span>
        </td>
        <td>${escapeHtml(SOURCE_LABEL[row.source] || row.source)}</td>
        <td>${escapeHtml(row.summary || "—")}</td>
        <td>${escapeHtml(row.datetime || "—")}</td>
      </tr>`;
    })
    .join("");

  empty.classList.toggle("hidden", items.length > 0);
  document.getElementById("actionPageInfo").textContent =
    `Página ${filters.page} / ${filters.totalPages} · ${data.total || 0} registros`;
  document.getElementById("actionPrev").disabled = filters.page <= 1;
  document.getElementById("actionNext").disabled = filters.page >= filters.totalPages;
}

async function loadLog() {
  const req = ++filters.req;
  const data = await fetchActions({
    page: String(filters.page),
    limit: String(PAGE_SIZE),
    channel: filters.channel,
    type: filters.type,
    status: filters.status,
    range: filters.date ? "all" : filters.range,
    date: filters.date,
    q: filters.q,
  });
  if (req !== filters.req) return;
  renderLog(data);
}

function renderSummary(log) {
  if (!log) return;
  renderLast(
    document.getElementById("lastWaText"),
    document.getElementById("lastWaPill"),
    log.lastWhatsApp
  );
  renderLast(
    document.getElementById("lastMailText"),
    document.getElementById("lastMailPill"),
    log.lastEmail
  );
  renderLast(
    document.getElementById("lastReportText"),
    document.getElementById("lastReportPill"),
    log.lastReport
  );
}

async function loadStatus() {
  setConn("pending", "Cargando…");
  const data = await fetchNotifications();
  const mail = data.email || {};
  const wa = data.whatsapp || {};
  const hour = String(mail.reportHour ?? 21).padStart(2, "0");

  pill(
    document.getElementById("mailPill"),
    mail.configured ? (mail.dailyEnabled ? "ok" : "warn") : "off",
    mail.configured ? (mail.dailyEnabled ? "activo" : "configurado") : "sin .env"
  );
  secrets.mail.full = mail.to || "";
  secrets.mail.masked = mail.toMasked || "";
  renderSecret("mail");
  document.getElementById("mailDaily").textContent = `${yn(mail.dailyEnabled)} · ${hour}:00 AR`;
  document.getElementById("mailFail").textContent = yn(mail.failEnabled);

  const waKind = wa.rateLimited ? "warn" : wa.enabled ? "ok" : "off";
  const waLabel = wa.rateLimited
    ? "en cooldown"
    : wa.enabled
      ? "activo"
      : wa.configured
        ? "desactivado"
        : "sin .env";
  pill(document.getElementById("waPill"), waKind, waLabel);
  secrets.phone.full = wa.phone || "";
  secrets.phone.masked = wa.phoneMasked || formatPhoneMasked(wa.phone);
  renderSecret("phone");
  document.getElementById("waLimit").textContent = wa.rateLimited
    ? `limitado hasta ${arTime(wa.rateLimitedUntil)}`
    : "disponible";
  document.getElementById("waCooldown").textContent = `${Math.round((wa.cooldownMs || 0) / 60000)} min`;
  document.getElementById("policyHour").textContent =
    `Reporte diario a las ${hour}:00 AR (Gmail + WhatsApp).`;

  setBtnEnabled(buttons.waTest, Boolean(wa.configured));
  setBtnEnabled(buttons.failTest, Boolean(wa.configured || mail.failEnabled));
  setBtnEnabled(buttons.reportEmail, Boolean(mail.configured));
  setBtnEnabled(buttons.reportWa, Boolean(wa.configured));
  setBtnEnabled(buttons.reportAll, Boolean(mail.configured || wa.configured));

  renderSummary(data.log || (await fetchActionSummary().catch(() => null)));
  setConn("ok", "Estado al día");
  return data;
}

async function refreshAll() {
  await loadStatus();
  await loadLog();
}

async function runAction(label, fn) {
  setBusy(true);
  showResult(`Ejecutando: ${label}…`, true);
  try {
    const data = await fn();
    showResult(data);
    await refreshAll().catch(() => {});
  } catch (err) {
    showResult({ error: err.message || String(err) });
  } finally {
    setBusy(false);
  }
}

function setFilterActive(attr, value) {
  document.querySelectorAll(`.filter[${attr}]`).forEach((b) => {
    b.classList.toggle("is-active", b.dataset[attr.replace("data-", "")] === value);
  });
}

function bindLogFilters() {
  document.querySelectorAll(".filter[data-channel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.channel = btn.dataset.channel;
      filters.page = 1;
      setFilterActive("data-channel", filters.channel);
      loadLog();
    });
  });
  document.querySelectorAll(".filter[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.type = btn.dataset.type;
      filters.page = 1;
      setFilterActive("data-type", filters.type);
      loadLog();
    });
  });
  document.querySelectorAll(".filter[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.status = btn.dataset.status;
      filters.page = 1;
      setFilterActive("data-status", filters.status);
      loadLog();
    });
  });
  document.querySelectorAll(".filter[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.range = btn.dataset.range;
      filters.date = "";
      filters.page = 1;
      const dateEl = document.getElementById("actionDate");
      if (dateEl) dateEl.value = "";
      setFilterActive("data-range", filters.range);
      loadLog();
    });
  });
  document.getElementById("actionDate")?.addEventListener("change", (e) => {
    filters.date = e.target.value || "";
    if (filters.date) {
      filters.range = "all";
      setFilterActive("data-range", "all");
    }
    filters.page = 1;
    loadLog();
  });
  document.getElementById("actionSearch")?.addEventListener("input", (e) => {
    clearTimeout(filters.searchTimer);
    filters.searchTimer = setTimeout(() => {
      filters.q = e.target.value.trim();
      filters.page = 1;
      loadLog();
    }, 250);
  });
  document.getElementById("resetActionFilters")?.addEventListener("click", () => {
    filters.channel = "all";
    filters.type = "all";
    filters.status = "all";
    filters.range = "all";
    filters.date = "";
    filters.q = "";
    filters.page = 1;
    setFilterActive("data-channel", "all");
    setFilterActive("data-type", "all");
    setFilterActive("data-status", "all");
    setFilterActive("data-range", "all");
    const dateEl = document.getElementById("actionDate");
    const searchEl = document.getElementById("actionSearch");
    if (dateEl) dateEl.value = "";
    if (searchEl) searchEl.value = "";
    loadLog();
  });
  document.getElementById("actionPrev")?.addEventListener("click", () => {
    if (filters.page <= 1) return;
    filters.page -= 1;
    loadLog();
  });
  document.getElementById("actionNext")?.addEventListener("click", () => {
    if (filters.page >= filters.totalPages) return;
    filters.page += 1;
    loadLog();
  });
}

bindSecretToggle("mail", "toggleMail");
bindSecretToggle("phone", "togglePhone");
bindLogFilters();

document.getElementById("refreshStatus")?.addEventListener("click", () => {
  refreshAll().catch((err) => {
    setConn("fail", "Sin estado");
    showResult({
      error:
        err.message === "HTTP 404"
          ? "HTTP 404: reconstruí Docker o reiniciá el bot para cargar las APIs nuevas."
          : err.message || String(err),
    });
  });
});

document.getElementById("btnWaTest")?.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Test WhatsApp",
    message:
      "Se va a enviar un mensaje corto de conectividad a CallMeBot.\nNo es una alerta de fallo ni el reporte diario.",
    confirmLabel: "Enviar test",
    tone: "accent",
  });
  if (!ok) return;
  runAction("test WhatsApp", testWhatsApp);
});
document.getElementById("btnFailPreview")?.addEventListener("click", () => {
  runAction("vista previa alerta", () => testFailAlert(true));
});
document.getElementById("btnFailTest")?.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Simular alerta de fallo",
    message:
      "Se simula un listing caído y se intenta avisar por WhatsApp.\nSi CallMeBot encola o limita, también puede salir Gmail.",
    confirmLabel: "Enviar alerta",
    tone: "danger",
  });
  if (!ok) return;
  runAction("alerta de fallo", () => testFailAlert(false));
});
document.getElementById("btnReportPreview")?.addEventListener("click", () => {
  runAction("vista previa reporte", () => previewDailyReport());
});
document.getElementById("btnReportEmail")?.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Reporte por Gmail",
    message: "Se envía el reporte diario del día (Argentina) solo por Gmail.",
    confirmLabel: "Enviar Gmail",
    tone: "accent",
  });
  if (!ok) return;
  runAction("reporte Gmail", () => sendDailyReport({ channels: "email" }));
});
document.getElementById("btnReportWa")?.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Reporte por WhatsApp",
    message:
      "Se envía el reporte diario solo por WhatsApp.\nCuenta para el cupo de CallMeBot.",
    confirmLabel: "Enviar WhatsApp",
    tone: "accent",
  });
  if (!ok) return;
  runAction("reporte WhatsApp", () => sendDailyReport({ channels: "whatsapp" }));
});
document.getElementById("btnReportAll")?.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "Reporte completo",
    message: "Se envía el reporte diario por Gmail y WhatsApp, igual que a las 21:00 AR.",
    confirmLabel: "Enviar ambos",
    tone: "accent",
  });
  if (!ok) return;
  runAction("reporte ambos", () => sendDailyReport({ channels: "all" }));
});

if (typeof io === "function") {
  const socket = io();
  socket.on("action", () => {
    if (filters.page === 1) loadLog().catch(() => {});
    fetchActionSummary().then(renderSummary).catch(() => {});
  });
}

refreshAll().catch((err) => {
  setConn("fail", "Sin estado");
  pill(document.getElementById("mailPill"), "off", "sin datos");
  pill(document.getElementById("waPill"), "off", "sin datos");
  showResult({
    error:
      err.message === "HTTP 404"
        ? "HTTP 404: reconstruí Docker o reiniciá el bot para cargar las APIs nuevas."
        : err.message || String(err),
  });
});
