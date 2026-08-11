import {
  getDailyReport,
  argentinaYmd,
  addDaysToYmd,
} from "../../db/memoryDb.js";
import {
  isMailConfigured,
  isDailyReportEnabled,
  createTransport,
  mailFrom,
  mailTo,
  escapeHtml,
} from "./mailer.js";

export { isMailConfigured, isDailyReportEnabled };

function formatReportText(report) {
  const plat =
    report.platform === "all"
      ? "Todas"
      : report.platform === "facebook"
        ? "Facebook"
        : "MercadoLibre";

  const lines = [
    `Reporte diario — Improve Product Statistics`,
    `Fecha: ${report.dateYmd} (Argentina)`,
    `Plataforma: ${plat}`,
    ``,
    `Resumen`,
    `- Total: ${report.total}`,
    `- OK: ${report.ok}`,
    `- Fallos: ${report.fail}`,
    `- Éxito: ${report.successRate}%`,
    ``,
  ];

  if (report.byProduct?.length) {
    lines.push(`Por producto`);
    for (const p of report.byProduct) {
      lines.push(
        `- ${p.product}: ${p.ok} ok / ${p.fail} fail / ${p.total} total`
      );
    }
    lines.push(``);
  }

  if (report.recentFailures?.length) {
    lines.push(`Últimos fallos`);
    for (const f of report.recentFailures) {
      lines.push(`- #${f.id} ${f.product}: ${f.error || "(sin detalle)"}`);
    }
    lines.push(``);
  } else {
    lines.push(`Sin fallos en el período.`);
    lines.push(``);
  }

  lines.push(`— Bot Improve Product Statistics`);
  return lines.join("\n");
}

function formatReportHtml(report) {
  const plat =
    report.platform === "all"
      ? "Todas"
      : report.platform === "facebook"
        ? "Facebook"
        : "MercadoLibre";

  const products = (report.byProduct || [])
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.product)}</td><td>${p.ok}</td><td>${p.fail}</td><td>${p.total}</td></tr>`
    )
    .join("");

  const fails = (report.recentFailures || [])
    .map(
      (f) =>
        `<li><strong>#${f.id} ${escapeHtml(f.product)}</strong><br/><code>${escapeHtml(f.error || "(sin detalle)")}</code></li>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="font-family:Segoe UI,Arial,sans-serif;color:#1a1a1a;line-height:1.45">
  <h2 style="margin:0 0 8px">Reporte diario</h2>
  <p style="margin:0 0 16px;color:#555">
    <strong>${escapeHtml(report.dateYmd)}</strong> · Argentina · ${escapeHtml(plat)}
  </p>
  <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px">
    <tr style="background:#f4f4f4"><td>Total</td><td><strong>${report.total}</strong></td></tr>
    <tr><td>OK</td><td style="color:#1a7f4b"><strong>${report.ok}</strong></td></tr>
    <tr style="background:#f4f4f4"><td>Fallos</td><td style="color:#b33"><strong>${report.fail}</strong></td></tr>
    <tr><td>Éxito</td><td><strong>${report.successRate}%</strong></td></tr>
  </table>
  ${
    products
      ? `<h3>Por producto</h3>
  <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:560px">
    <thead><tr style="background:#eee;text-align:left"><th>Producto</th><th>OK</th><th>Fail</th><th>Total</th></tr></thead>
    <tbody>${products}</tbody>
  </table>`
      : ""
  }
  ${
    fails
      ? `<h3>Últimos fallos</h3><ul>${fails}</ul>`
      : `<p>Sin fallos en el período.</p>`
  }
  <p style="margin-top:24px;color:#888;font-size:12px">Improve Product Statistics Bot</p>
</body>
</html>`;
}

/**
 * @param {{
 *   dateYmd?: string,
 *   platform?: string,
 *   dryRun?: boolean,
 *   force?: boolean,
 *   channels?: "all"|"email"|"whatsapp",
 * }} opts
 */
export async function sendDailyActivityReport(opts = {}) {
  const platform =
    opts.platform || process.env.REPORT_PLATFORM || "facebook";
  const dateYmd = opts.dateYmd || argentinaYmd(new Date());
  const channels = opts.channels || "all";
  const wantEmail = channels === "all" || channels === "email";
  const wantWhatsApp = channels === "all" || channels === "whatsapp";

  const report = getDailyReport({ dateYmd, platform });

  if (opts.dryRun) {
    const { formatDailyReportWhatsApp } = await import(
      "../whatsapp/index.js"
    );
    return {
      sent: false,
      reason: "dryRun",
      report,
      channels,
      whatsappPreview: wantWhatsApp
        ? formatDailyReportWhatsApp(report)
        : undefined,
    };
  }

  let email = { sent: false, reason: "skipped" };
  let whatsapp = { sent: false, reason: "skipped" };

  if (wantEmail) {
    if (!isMailConfigured()) {
      return { sent: false, reason: "notConfigured", report, channels, email, whatsapp };
    }
    if (!opts.force && !isDailyReportEnabled()) {
      return { sent: false, reason: "disabled", report, channels, email, whatsapp };
    }

    const to = mailTo();
    const transporter = createTransport();
    const info = await transporter.sendMail({
      from: mailFrom(),
      to,
      subject: `[IPS Bot] Reporte ${dateYmd} · ${platform === "facebook" ? "Facebook" : platform} · ${report.ok} ok / ${report.fail} fail`,
      text: formatReportText(report),
      html: formatReportHtml(report),
    });

    console.log(`📧 Reporte diario enviado a ${to} · messageId=${info.messageId}`);
    email = { sent: true, messageId: info.messageId };
  }

  if (wantWhatsApp) {
    try {
      const { sendDailyReportWhatsApp } = await import("../whatsapp/index.js");
      whatsapp = await sendDailyReportWhatsApp(report, { force: opts.force });
    } catch (err) {
      console.error(`📱 WhatsApp reporte error:`, err.message);
      whatsapp = { sent: false, reason: "error", error: err.message };
    }
  }

  const sent = Boolean(email.sent || whatsapp.sent);
  return {
    sent,
    messageId: email.messageId,
    report,
    channels,
    email,
    whatsapp,
  };
}

export { addDaysToYmd, argentinaYmd };
