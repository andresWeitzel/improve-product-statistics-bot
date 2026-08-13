/**
 * Notificaciones:
 * - Gmail: reporte diario + fallback de fallos (si CallMeBot encola)
 * - WhatsApp: fallos (si llegan al instante) + copia del reporte
 */
export {
  isMailConfigured,
  isDailyReportEnabled,
  sendDailyActivityReport,
  startDailyReportScheduler,
  msUntilNextMidnightArgentina,
  msUntilNextArgentinaHour,
  dailyReportHour,
} from "./email/index.js";

export { isMailFailEnabled, sendFailAlertEmail } from "./email/failAlert.js";

export {
  isWhatsAppConfigured,
  isWhatsAppEnabled,
  isWhatsAppRateLimited,
  getWhatsAppRateLimitedUntil,
  sendWhatsAppText,
} from "./whatsapp/callMeBot.js";

export {
  isWhatsAppReportEnabled,
  sendDailyReportWhatsApp,
  formatDailyReportWhatsApp,
} from "./whatsapp/index.js";

export {
  notifyVisitFailure,
  sendFailAlertTest,
  getFailAlertMeta,
} from "./notifyFailure.js";

export { formatFailMessage, formatTestMessage } from "./whatsapp/format.js";
