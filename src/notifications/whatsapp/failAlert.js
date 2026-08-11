import {
  isWhatsAppEnabled,
  isWhatsAppConfigured,
  sendWhatsAppText,
} from "./callMeBot.js";
import { formatFailMessage } from "./format.js";

const state = {
  lastSentAt: 0,
  suppressed: 0,
};

function cooldownMs() {
  const n = Number(process.env.WHATSAPP_FAIL_COOLDOWN_MS);
  return Number.isFinite(n) && n >= 0 ? n : 5 * 60 * 1000;
}

/**
 * Fallos → solo WhatsApp (CallMeBot).
 * @param {{ force?: boolean, dryRun?: boolean }} [opts]
 */
export async function notifyVisitFailure(visit, opts = {}) {
  const text = formatFailMessage(visit, 0);

  if (opts.dryRun) {
    return {
      sent: false,
      reason: "dryRun",
      preview: { channel: "whatsapp", text },
    };
  }

  if (!opts.force && !isWhatsAppEnabled()) {
    return { sent: false, reason: "disabled" };
  }

  if (!isWhatsAppConfigured()) {
    return { sent: false, reason: "notConfigured" };
  }

  const now = Date.now();
  const cool = cooldownMs();
  if (!opts.force && cool > 0 && now - state.lastSentAt < cool) {
    state.suppressed += 1;
    return { sent: false, reason: "cooldown", suppressed: state.suppressed };
  }

  const suppressed = opts.force ? 0 : state.suppressed;
  if (!opts.force) state.suppressed = 0;
  state.lastSentAt = now;

  const message = formatFailMessage(visit, suppressed);

  try {
    const result = await sendWhatsAppText(message);
    if (!result.ok) {
      console.error(
        `📱 WhatsApp fallo no enviado: ${result.reason || `HTTP ${result.status}`} ${result.body || ""}`
      );
      return { sent: false, ...result };
    }
    console.log(
      `📱 WhatsApp fallo · ${visit?.platform}:${visit?.product}${suppressed ? ` (+${suppressed} omitidos)` : ""}`
    );
    return { sent: true, suppressed };
  } catch (err) {
    console.error(`📱 WhatsApp error:`, err.message);
    return { sent: false, reason: "error", error: err.message };
  }
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
      "Listing FB sin contenido usable (prueba CallMeBot)",
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
    channel: "whatsapp",
    enabled: isWhatsAppEnabled(),
    configured: isWhatsAppConfigured(),
    cooldownMs: cooldownMs(),
    lastSentAt: state.lastSentAt || null,
    suppressed: state.suppressed,
  };
}
