/**
 * Formato UX WhatsApp (CallMeBot).
 * WA no permite colores: usamos emojis, negrita, monospace y aire visual.
 * El carácter ㅤ evita que WhatsApp comprima saltos de línea vacíos.
 */

export const GAP = "ㅤ";
export const RULE = "━━━━━━━━━━━━━━━━";
export const RULE_SOFT = "···············";

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

/** Une bloques con aire real entre secciones. */
export function joinBlocks(blocks) {
  return blocks
    .filter((b) => b != null && String(b).trim() !== "")
    .map((b) => String(b).trim())
    .join(`\n\n${GAP}\n\n`);
}

export function section(titleLine, bodyLines = []) {
  // Conservar líneas vacías a propósito (aire visual).
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

  const banner = [
    `🔴🔴🔴🔴🔴🔴🔴🔴`,
    `‼️ *FALLO DE VISITA*`,
    `🔴🔴🔴🔴🔴🔴🔴🔴`,
    ``,
    `*IPS Bot* · alerta inmediata`,
  ].join("\n");

  const meta = section(`📋 *Detalle*`, [
    RULE,
    `${platformEmoji(plat)} *Plataforma*`,
    platformLabel(plat),
    ``,
    `📦 *Producto*`,
    `*${product}*`,
    ``,
    `🕐 *Hora*`,
    when,
  ]);

  const errBlock = [
    `❌ *ERROR*`,
    RULE,
    "```",
    error,
    "```",
  ].join("\n");

  const linkBlock = visit?.url
    ? ["🔗 *Link del listing*", RULE_SOFT, visit.url].join("\n")
    : null;

  const suppressedBlock =
    suppressed > 0
      ? `ℹ️ _(+${suppressed} fallos omitidos por cooldown)_`
      : null;

  const footer = [
    RULE,
    `👀 Revisá el monitor`,
    `_http://localhost:9008_`,
  ].join("\n");

  return joinBlocks([banner, meta, errBlock, linkBlock, suppressedBlock, footer]);
}

export function formatDailyReportWhatsApp(report) {
  const rate = Number(report.successRate) || 0;
  const fail = Number(report.fail) || 0;
  const ok = Number(report.ok) || 0;
  const total = Number(report.total) || 0;
  const health = healthEmoji(rate, fail);

  const header = [
    `📊 *REPORTE DIARIO*`,
    `*IPS Bot*`,
    RULE,
    `📅 ${report.dateYmd} · Argentina`,
    `${platformEmoji(report.platform)} ${platformLabel(report.platform)}`,
    `${health} ${fail === 0 ? "*Todo OK*" : `*${fail} fallo(s) detectado(s)*`}`,
  ].join("\n");

  const summary = section(`📈 *Resumen del día*`, [
    RULE_SOFT,
    `▫️ Total········ *${total}*`,
    `✅ OK··········· *${ok}*`,
    `${fail > 0 ? "🚨" : "✨"} Fallos······· *${fail}*`,
    `📊 Éxito········ *${rate}%*`,
  ]);

  let products = null;
  if (report.byProduct?.length) {
    const rows = [];
    for (const p of report.byProduct.slice(0, 8)) {
      const mark = p.fail > 0 ? "⚠️" : "✅";
      rows.push(`${mark} *${p.product}*`);
      rows.push(`    ${p.ok} ok  ·  ${p.fail} fail  ·  ${p.total} total`);
      rows.push(GAP);
    }
    products = section(`📦 *Por producto*`, [RULE_SOFT, ...rows]);
  }

  let failures = null;
  if (report.recentFailures?.length) {
    const rows = [];
    for (const f of report.recentFailures.slice(0, 5)) {
      rows.push(`🔴 *${f.product}*`);
      rows.push(`    ↳ ${f.error || "(sin detalle)"}`);
      rows.push(GAP);
    }
    failures = section(`🚨 *Últimos fallos*`, [RULE_SOFT, ...rows]);
  } else {
    failures = `✨ *Sin fallos* en el período.`;
  }

  const footer = [
    RULE,
    `_Improve Product Statistics_`,
    `_Reporte automático · 21:00 AR_`,
  ].join("\n");

  return joinBlocks([header, summary, products, failures, footer]);
}

export function formatTestMessage(when = new Date()) {
  const stamp = when.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return joinBlocks([
    ["✅ *IPS Bot — Test*", RULE, "CallMeBot conectado correctamente.", `🕐 ${stamp}`].join(
      "\n"
    ),
    `_Improve Product Statistics_`,
  ]);
}
