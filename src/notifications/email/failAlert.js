import {
  isMailConfigured,
  isDailyReportEnabled,
  envFlag,
  createTransport,
  mailFrom,
  mailTo,
  escapeHtml,
} from "./mailer.js";

function platformLabel(id) {
  if (id === "facebook") return "Facebook Marketplace";
  if (id === "mercadolibre") return "MercadoLibre";
  return id || "—";
}

/** Fallos por mail: inmediato (sin cola CallMeBot). */
export function isMailFailEnabled() {
  if (!isMailConfigured()) return false;
  if (
    process.env.MAIL_FAIL_ENABLED === undefined ||
    process.env.MAIL_FAIL_ENABLED === ""
  ) {
    // Default: si el mail del reporte está ON, fallos por mail también
    return isDailyReportEnabled() || envFlag("MAIL_ENABLED", false);
  }
  return envFlag("MAIL_FAIL_ENABLED", false);
}

function formatText(visit, note) {
  const when =
    visit?.datetime ||
    (visit?.iso
      ? new Date(visit.iso).toLocaleString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
        })
      : new Date().toLocaleString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
        }));

  const lines = [
    `IPS Bot · Fallo de visita`,
    ``,
    `Plataforma: ${platformLabel(visit?.platform)}`,
    `Producto: ${visit?.product || "—"}`,
    `Hora: ${when}`,
    `Error: ${visit?.error || "(sin detalle)"}`,
  ];
  if (visit?.url) lines.push(`URL: ${visit.url}`);
  if (note) {
    lines.push(``);
    lines.push(note);
  }
  lines.push(``);
  lines.push(`— Improve Product Statistics Bot`);
  return lines.join("\n");
}

function formatHtml(visit, note) {
  const when =
    visit?.datetime ||
    (visit?.iso
      ? new Date(visit.iso).toLocaleString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
        })
      : "");

  return `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;line-height:1.45;color:#1a1a1a">
  <h2 style="margin:0 0 8px;color:#b33">Fallo de visita</h2>
  <table cellpadding="8" cellspacing="0" style="border-collapse:collapse">
    <tr style="background:#f4f4f4"><td>Plataforma</td><td><strong>${escapeHtml(platformLabel(visit?.platform))}</strong></td></tr>
    <tr><td>Producto</td><td><strong>${escapeHtml(visit?.product || "—")}</strong></td></tr>
    <tr style="background:#f4f4f4"><td>Hora</td><td>${escapeHtml(when)}</td></tr>
    <tr><td>Error</td><td><code>${escapeHtml(visit?.error || "(sin detalle)")}</code></td></tr>
  </table>
  ${visit?.url ? `<p style="margin-top:16px"><a href="${escapeHtml(visit.url)}">${escapeHtml(visit.url)}</a></p>` : ""}
  ${note ? `<p style="color:#666;margin-top:16px">${escapeHtml(note)}</p>` : ""}
  <p style="margin-top:24px;color:#888;font-size:12px">Improve Product Statistics Bot</p>
</body></html>`;
}

/**
 * @param {object} visit
 * @param {{ force?: boolean, note?: string }} [opts]
 */
export async function sendFailAlertEmail(visit, opts = {}) {
  if (!opts.force && !isMailFailEnabled()) {
    return { sent: false, reason: "disabled" };
  }
  if (!isMailConfigured()) {
    return { sent: false, reason: "notConfigured" };
  }

  const product = visit?.product || "producto";
  const note = opts.note || null;

  try {
    const transporter = createTransport();
    const info = await transporter.sendMail({
      from: mailFrom(),
      to: mailTo(),
      subject: `[IPS Bot] Fallo · ${platformLabel(visit?.platform)} · ${product}`,
      text: formatText(visit, note),
      html: formatHtml(visit, note),
    });
    console.log(
      `📧 Alerta fallo Gmail · ${visit?.platform}:${product} · ${info.messageId}`
    );
    return { sent: true, messageId: info.messageId, channel: "email" };
  } catch (err) {
    console.error(`📧 Alerta fallo Gmail error:`, err.message);
    return { sent: false, reason: "error", error: err.message };
  }
}
