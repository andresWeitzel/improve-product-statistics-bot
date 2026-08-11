/**
 * Canal de notificaciones.
 * Hoy: email (reporte diario Gmail).
 */
export {
  isMailConfigured,
  isDailyReportEnabled,
  sendDailyActivityReport,
  startDailyReportScheduler,
  msUntilNextMidnightArgentina,
} from "./email/index.js";
