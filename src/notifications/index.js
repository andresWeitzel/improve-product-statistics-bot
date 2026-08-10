/**
 * Canal de notificaciones.
 * Hoy: email (reporte diario).
 * Luego: whatsapp/ (alertas de fallos).
 */
export {
  isMailConfigured,
  isDailyReportEnabled,
  sendDailyActivityReport,
  startDailyReportScheduler,
  msUntilNextMidnightArgentina,
} from "./email/index.js";
