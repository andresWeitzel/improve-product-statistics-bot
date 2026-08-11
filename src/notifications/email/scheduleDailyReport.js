import { argentinaYmd } from "../../db/memoryDb.js";
import { sendDailyActivityReport, isDailyReportEnabled } from "./dailyReport.js";

const AR_TZ = "America/Argentina/Buenos_Aires";

/** Hora local AR del reporte diario (default 21 = 21:00). */
export function dailyReportHour() {
  const n = Number(process.env.REPORT_HOUR);
  if (Number.isFinite(n) && n >= 0 && n <= 23) return Math.floor(n);
  return 21;
}

function arClockParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: AR_TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  let h = Number(parts.hour);
  if (h === 24) h = 0;
  return {
    hour: h,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** ms hasta la próxima HH:00 en Argentina. */
export function msUntilNextArgentinaHour(targetHour = dailyReportHour()) {
  const { hour: h, minute: mi, second: s } = arClockParts();
  let ms = ((targetHour - h) * 3600 + (0 - mi) * 60 - s) * 1000;
  if (ms <= 1000) ms += 24 * 60 * 60 * 1000;
  return ms;
}

/** @deprecated usar msUntilNextArgentinaHour */
export function msUntilNextMidnightArgentina() {
  return msUntilNextArgentinaHour(0);
}

/**
 * Agenda el reporte diario a las REPORT_HOUR AR (default 21:00).
 * Cubre el día calendario actual hasta esa hora.
 */
export function startDailyReportScheduler() {
  if (!isDailyReportEnabled()) {
    console.log(
      "📧 Reporte diario desactivado (MAIL_ENABLED=false o faltan MAIL_USER/MAIL_PASS)"
    );
    return;
  }

  const hour = dailyReportHour();

  const scheduleNext = () => {
    const wait = msUntilNextArgentinaHour(hour);
    const nextAt = new Date(Date.now() + wait);
    console.log(
      `📧 Próximo reporte diario: ${nextAt.toISOString()} (~${Math.round(wait / 60000)} min, ${String(hour).padStart(2, "0")}:00 AR)`
    );

    setTimeout(async () => {
      try {
        await sendDailyActivityReport({
          dateYmd: argentinaYmd(new Date()),
        });
      } catch (err) {
        console.error("📧 Error enviando reporte diario:", err.message);
      } finally {
        scheduleNext();
      }
    }, wait);
  };

  scheduleNext();
}
