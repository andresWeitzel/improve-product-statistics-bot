import { sendDailyActivityReport, isDailyReportEnabled } from "./dailyEmailReport.js";

const AR_TZ = "America/Argentina/Buenos_Aires";

/** ms hasta la próxima medianoche en Argentina. */
export function msUntilNextMidnightArgentina() {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: AR_TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  let h = Number(parts.hour);
  if (h === 24) h = 0;
  const mi = Number(parts.minute);
  const s = Number(parts.second);

  // Tiempo restante hasta 24:00
  let ms = ((23 - h) * 3600 + (59 - mi) * 60 + (60 - s)) * 1000;
  if (ms <= 1000) ms += 24 * 60 * 60 * 1000;
  return ms;
}

/**
 * Agenda el reporte diario a las 00:00 AR (cubre el día que acaba de terminar).
 */
export function startDailyReportScheduler() {
  if (!isDailyReportEnabled()) {
    console.log(
      "📧 Reporte diario desactivado (MAIL_ENABLED=false o faltan MAIL_USER/MAIL_PASS)"
    );
    return;
  }

  const scheduleNext = () => {
    const wait = msUntilNextMidnightArgentina();
    const nextAt = new Date(Date.now() + wait);
    console.log(
      `📧 Próximo reporte diario: ${nextAt.toISOString()} (~${Math.round(wait / 60000)} min, medianoche AR)`
    );

    setTimeout(async () => {
      try {
        await sendDailyActivityReport();
      } catch (err) {
        console.error("📧 Error enviando reporte diario:", err.message);
      } finally {
        scheduleNext();
      }
    }, wait);
  };

  scheduleNext();
}
