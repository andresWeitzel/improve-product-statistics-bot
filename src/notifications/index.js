/**
 * Notificaciones:
 * - Gmail: reporte diario (21:00 AR)
 * - WhatsApp (CallMeBot): fallos + copia del reporte diario
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

export {
  isWhatsAppConfigured,
  isWhatsAppEnabled,
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
} from "./whatsapp/failAlert.js";
