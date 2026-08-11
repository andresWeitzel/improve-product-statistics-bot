/**
 * Orquestación de alertas de fallo.
 *
 * CallMeBot free (~16 msgs / 240 min) puede ENCOLAR y avisar tarde → inútil.
 * Política:
 *  1) Intentar WhatsApp solo si no estamos en rate-limit.
 *  2) Si WA llega inmediato → OK.
 *  3) Si WA encola / falla / está limitado → Gmail YA (aviso confiable).
 */
import { sendFailAlertEmail, isMailFailEnabled } from "./email/failAlert.js";
import {
  notifyVisitFailureWhatsApp,
  getFailAlertMeta as getWhatsAppFailMeta,
} from "./whatsapp/failAlert.js";
import {
  isWhatsAppEnabled,
  isWhatsAppRateLimited,
  getWhatsAppRateLimitedUntil,
} from "./whatsapp/callMeBot.js";

/**
 * @param {object} visit
 * @param {{ force?: boolean, dryRun?: boolean }} [opts]
 */
export async function notifyVisitFailure(visit, opts = {}) {
  const result = {
    whatsapp: { sent: false, reason: "skipped" },
    email: { sent: false, reason: "skipped" },
  };

  if (opts.dryRun) {
    const wa = await notifyVisitFailureWhatsApp(visit, {
      force: true,
      dryRun: true,
    });
    return {
      sent: false,
      reason: "dryRun",
      preview: wa.preview,
      ...result,
      whatsapp: wa,
    };
  }

  const tryWhatsApp = isWhatsAppEnabled() || opts.force;

  if (tryWhatsApp) {
    if (isWhatsAppRateLimited()) {
      const mins = Math.ceil(
        (getWhatsAppRateLimitedUntil() - Date.now()) / 60000
      );
      result.whatsapp = {
        sent: false,
        reason: "rateLimited",
        queued: true,
        body: `cooldown ~${mins} min`,
      };
      console.log(
        `📱 Fallo: salteo WhatsApp (rate-limit ~${mins} min) → Gmail`
      );
    } else {
      result.whatsapp = await notifyVisitFailureWhatsApp(visit, {
        force: opts.force,
      });
    }
  } else {
    result.whatsapp = { sent: false, reason: "disabled" };
  }

  const waReliable =
    result.whatsapp.sent === true && result.whatsapp.queued !== true;

  const needEmail = !waReliable && (isMailFailEnabled() || opts.force);

  if (needEmail) {
    const note = result.whatsapp.queued
      ? "WhatsApp (CallMeBot) estaba en cola/rate-limit; este mail es el aviso inmediato."
      : result.whatsapp.reason && result.whatsapp.reason !== "disabled"
        ? `WhatsApp no disponible (${result.whatsapp.reason}); aviso por mail.`
        : null;

    result.email = await sendFailAlertEmail(visit, {
      force: opts.force,
      note,
    });
  }

  const sent = Boolean(result.email.sent || waReliable);
  return {
    sent,
    channel: result.email.sent
      ? waReliable
        ? "whatsapp+email"
        : "email"
      : waReliable
        ? "whatsapp"
        : "none",
    ...result,
  };
}

export async function sendFailAlertTest(opts = {}) {
  const now = new Date();
  const visit = {
    id: 0,
    platform: opts.platform || "facebook",
    product: opts.product || "Cama cucheta (prueba)",
    url:
      opts.url ||
      "https://www.facebook.com/marketplace/item/000000000000000/",
    error:
      opts.error ||
      "Listing FB sin contenido usable (prueba alerta)",
    datetime: now.toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    }),
    iso: now.toISOString(),
  };

  return notifyVisitFailure(visit, {
    force: opts.force !== false,
    dryRun: Boolean(opts.dryRun),
  });
}

export function getFailAlertMeta() {
  return {
    whatsapp: getWhatsAppFailMeta(),
    mailFailEnabled: isMailFailEnabled(),
    whatsappRateLimited: isWhatsAppRateLimited(),
    whatsappRateLimitedUntil: getWhatsAppRateLimitedUntil() || null,
    policy:
      "WhatsApp si llega inmediato; si CallMeBot encola/limita → Gmail al instante",
  };
}
