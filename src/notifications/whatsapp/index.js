import {
  isWhatsAppEnabled,
  isWhatsAppConfigured,
  sendWhatsAppText,
} from "./callMeBot.js";

function envFlag(name, fallback = false) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Reporte diario también por WA (default = WHATSAPP_ENABLED). */
export function isWhatsAppReportEnabled() {
  if (!isWhatsAppConfigured()) return false;
  if (
    process.env.WHATSAPP_REPORT_ENABLED === undefined ||
    process.env.WHATSAPP_REPORT_ENABLED === ""
  ) {
    return isWhatsAppEnabled();
  }
  return envFlag("WHATSAPP_REPORT_ENABLED", false) && isWhatsAppConfigured();
}

function platformLabel(id) {
  if (id === "all") return "Todas";
  if (id === "facebook") return "Facebook";
  if (id === "mercadolibre") return "MercadoLibre";
  return id || "—";
}

export function formatDailyReportWhatsApp(report) {
  const lines = [
    `*IPS Bot · Reporte diario*`,
    `Fecha: ${report.dateYmd} (AR)`,
    `Plataforma: ${platformLabel(report.platform)}`,
    ``,
    `Total: ${report.total}`,
    `OK: ${report.ok}`,
    `Fallos: ${report.fail}`,
    `Éxito: ${report.successRate}%`,
  ];

  if (report.byProduct?.length) {
    lines.push(``);
    lines.push(`*Por producto*`);
    for (const p of report.byProduct.slice(0, 8)) {
      lines.push(`· ${p.product}: ${p.ok} ok / ${p.fail} fail`);
    }
  }

  if (report.recentFailures?.length) {
    lines.push(``);
    lines.push(`*Últimos fallos*`);
    for (const f of report.recentFailures.slice(0, 5)) {
      lines.push(`· ${f.product}: ${f.error || "(sin detalle)"}`);
    }
  }

  return lines.join("\n");
}

/**
 * @param {object} report
 * @param {{ force?: boolean, dryRun?: boolean }} [opts]
 */
export async function sendDailyReportWhatsApp(report, opts = {}) {
  if (!opts.force && !isWhatsAppReportEnabled()) {
    return { sent: false, reason: "disabled" };
  }
  if (!isWhatsAppConfigured()) {
    return { sent: false, reason: "notConfigured" };
  }

  const text = formatDailyReportWhatsApp(report);

  if (opts.dryRun) {
    return { sent: false, reason: "dryRun", preview: { channel: "whatsapp", text } };
  }

  try {
    const result = await sendWhatsAppText(text);
    if (!result.ok) {
      console.error(
        `📱 WhatsApp reporte no enviado: ${result.reason || `HTTP ${result.status}`} ${result.body || ""}`
      );
      return { sent: false, ...result };
    }
    console.log(`📱 WhatsApp reporte diario enviado · ${report.dateYmd}`);
    return { sent: true };
  } catch (err) {
    console.error(`📱 WhatsApp reporte error:`, err.message);
    return { sent: false, reason: "error", error: err.message };
  }
}
