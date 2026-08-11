import {
  isWhatsAppEnabled,
  isWhatsAppConfigured,
  sendWhatsAppText,
} from "./callMeBot.js";
import { formatDailyReportWhatsApp } from "./format.js";

export { formatDailyReportWhatsApp } from "./format.js";

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

  if (/FALLO DE VISITA/i.test(text)) {
    throw new Error("Bug: el reporte WA no debe formatearse como fallo");
  }

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
    console.log(`📱 WhatsApp reporte diario enviado · ${report.dateYmd}${result.queued ? " · EN COLA" : ""}`);
    return {
      sent: true,
      queued: Boolean(result.queued),
      immediate: Boolean(result.immediate),
    };
  } catch (err) {
    console.error(`📱 WhatsApp reporte error:`, err.message);
    return { sent: false, reason: "error", error: err.message };
  }
}
