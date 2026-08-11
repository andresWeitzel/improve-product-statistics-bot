/**
 * Formato UX WhatsApp (CallMeBot).
 * WA no permite colores ni espacio real entre burbujas:
 * padding liviano + etiqueta de tipo arriba/abajo.
 * Mantener mensajes relativamente cortos (rate-limit CallMeBot).
 */

export const GAP = "ㅤ";
export const RULE = "━━━━━━━━━━━━━━━━";
export const RULE_SOFT = "···············";

const KIND_FRAME = {
  fail: {
    label: "🔻 FALLO",
    bar: "🔴🔴🔴🔴🔴🔴",
  },
  report: {
    label: "▪️ REPORTE",
    bar: "⬛⬛⬛⬛⬛⬛",
  },
  test: {
    label: "▫️ TEST",
    bar: "⬜⬜⬜⬜⬜⬜",
  },
};

/** Margen liviano para separar burbujas consecutivas. */
export function frameMessage(kind, body) {
  const frame = KIND_FRAME[kind] || KIND_FRAME.test;
  return [
    GAP,
    frame.bar,
    `*${frame.label}*`,
    frame.bar,
    "",
    String(body || "").trim(),
    "",
    frame.bar,
    GAP,
  ].join("\n");
}

export function platformLabel(id) {
  if (id === "all") return "Todas";
  if (id === "facebook") return "Facebook Marketplace";
  if (id === "mercadolibre") return "MercadoLibre";
  return id || "—";
}

export function platformEmoji(id) {
  if (id === "facebook") return "📘";
  if (id === "mercadolibre") return "💛";
  return "🛒";
}

export function healthEmoji(successRate, fail) {
  if (fail === 0) return "🟢";
  if (successRate >= 80) return "🟡";
  return "🔴";
}

export function joinBlocks(blocks) {
  return blocks
    .filter((b) => b != null && String(b).trim() !== "")
    .map((b) => String(b).trim())
    .join(`\n\n${GAP}\n\n`);
}

export function section(titleLine, bodyLines = []) {
  return [titleLine, ...bodyLines.filter((l) => l != null)].join("\n");
}

export function formatFailMessage(visit, suppressed = 0) {
  const when =
    visit?.datetime ||
    (visit?.iso
      ? new Date(visit.iso).toLocaleString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
        })
      : new Date().toLocaleString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
        }));

  const product = visit?.product || "—";
  const error = visit?.error || "(sin detalle)";
  const plat = visit?.platform;

  const body = joinBlocks([
    [`‼️ *FALLO DE VISITA*`, `*IPS Bot*`].join("\n"),
    [
      `${platformEmoji(plat)} ${platformLabel(plat)}`,
      `📦 *${product}*`,
      `🕐 ${when}`,
    ].join("\n"),
    [`❌ *Error*`, "```", error, "```"].join("\n"),
    visit?.url ? [`🔗 Link`, visit.url].join("\n") : null,
    suppressed > 0
      ? `ℹ️ _(+${suppressed} omitidos por cooldown)_`
      : null,
  ]);

  return frameMessage("fail", body);
}

export function formatDailyReportWhatsApp(report) {
  const rate = Number(report.successRate) || 0;
  const fail = Number(report.fail) || 0;
  const ok = Number(report.ok) || 0;
  const total = Number(report.total) || 0;
  const health = healthEmoji(rate, fail);

  const header = [
    `📊 *REPORTE DIARIO*`,
    `📅 ${report.dateYmd} · AR`,
    `${platformEmoji(report.platform)} ${platformLabel(report.platform)}`,
    `${health} ${fail === 0 ? "*Todo OK*" : `*${fail} fallo(s)*`}`,
  ].join("\n");

  const summary = [
    `📈 *Resumen*`,
    `Total *${total}* · OK *${ok}* · Fallos *${fail}* · Éxito *${rate}%*`,
  ].join("\n");

  let products = null;
  if (report.byProduct?.length) {
    const rows = report.byProduct.slice(0, 8).map((p) => {
      const mark = p.fail > 0 ? "⚠️" : "✅";
      return `${mark} ${p.product}: ${p.ok}/${p.fail}`;
    });
    products = [`📦 *Productos*`, ...rows].join("\n");
  }

  let failures = null;
  if (report.recentFailures?.length) {
    const rows = report.recentFailures.slice(0, 4).map((f) => {
      return `🔴 ${f.product}: ${f.error || "(sin detalle)"}`;
    });
    failures = [`🚨 *Últimos fallos*`, ...rows].join("\n");
  } else {
    failures = `✨ Sin fallos en el período.`;
  }

  return frameMessage(
    "report",
    joinBlocks([header, summary, products, failures, `_IPS Bot · 21:00 AR_`])
  );
}

export function formatTestMessage(when = new Date()) {
  const stamp = when.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return frameMessage(
    "test",
    [`✅ *IPS Bot — Test*`, `CallMeBot OK`, `🕐 ${stamp}`].join("\n")
  );
}
