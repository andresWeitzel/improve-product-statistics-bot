import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * CallMeBot — WhatsApp personal.
 * https://www.callmebot.com/blog/free-api-whatsapp-messages/
 *
 * Límite free aproximado: ~16 mensajes / 240 min.
 * Si se supera, responde 210 y encola (puede demorar o agrupar).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAST_SEND_FILE = path.resolve(
  __dirname,
  "../../../data/.whatsapp-last-send"
);
const RATE_LIMIT_FILE = path.resolve(
  __dirname,
  "../../../data/.whatsapp-rate-limited-until"
);

function envFlag(name, fallback = false) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function rateLimitCooldownMs() {
  const n = Number(process.env.WHATSAPP_RATE_LIMIT_COOLDOWN_MS);
  // Tras EN COLA, no insistir con WA un rato (default 90 min)
  return Number.isFinite(n) && n >= 0 ? n : 90 * 60 * 1000;
}

export function getWhatsAppRateLimitedUntil() {
  try {
    const n = Number(fs.readFileSync(RATE_LIMIT_FILE, "utf8").trim());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function isWhatsAppRateLimited() {
  return Date.now() < getWhatsAppRateLimitedUntil();
}

export function markWhatsAppRateLimited(ms = rateLimitCooldownMs()) {
  const until = Date.now() + ms;
  try {
    fs.mkdirSync(path.dirname(RATE_LIMIT_FILE), { recursive: true });
    fs.writeFileSync(RATE_LIMIT_FILE, String(until), "utf8");
  } catch {
    // ignore
  }
  console.warn(
    `📱 CallMeBot rate-limit: no uso WhatsApp ~${Math.round(ms / 60000)} min (evito cola inútil)`
  );
  return until;
}

export function clearWhatsAppRateLimit() {
  try {
    fs.unlinkSync(RATE_LIMIT_FILE);
  } catch {
    // ignore
  }
}

export function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function isWhatsAppConfigured() {
  return Boolean(
    normalizePhone(process.env.WHATSAPP_PHONE) &&
      String(process.env.WHATSAPP_APIKEY || "").trim()
  );
}

export function isWhatsAppEnabled() {
  return envFlag("WHATSAPP_ENABLED", false) && isWhatsAppConfigured();
}

function sendGapMs() {
  const n = Number(process.env.WHATSAPP_SEND_GAP_MS);
  return Number.isFinite(n) && n >= 0 ? n : 4000;
}

function readLastSendAt() {
  try {
    const n = Number(fs.readFileSync(LAST_SEND_FILE, "utf8").trim());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeLastSendAt(ts = Date.now()) {
  try {
    fs.mkdirSync(path.dirname(LAST_SEND_FILE), { recursive: true });
    fs.writeFileSync(LAST_SEND_FILE, String(ts), "utf8");
  } catch {
    // ignore
  }
}

async function waitSendGap() {
  const gap = sendGapMs();
  if (gap <= 0) return;
  const wait = readLastSendAt() + gap - Date.now();
  if (wait > 0) {
    console.log(
      `📱 WhatsApp: espero ${Math.ceil(wait / 1000)}s entre mensajes (separación)`
    );
    await new Promise((r) => setTimeout(r, wait));
  }
}

function classifyCallMeBotBody(status, body) {
  const text = String(body || "");
  const queued =
    status === 210 ||
    /added into the queue|more than that|grouped with others|16 messages per 240/i.test(
      text
    );
  const immediate =
    !queued &&
    (/Message queued\./i.test(text) ||
      /will receive it in a few seconds/i.test(text) ||
      (status >= 200 && status < 300 && text.length < 400));

  return { queued, immediate: Boolean(immediate) };
}

/**
 * @param {string} text
 * @returns {Promise<{
 *   ok: boolean,
 *   status?: number,
 *   body?: string,
 *   reason?: string,
 *   queued?: boolean,
 *   immediate?: boolean,
 * }>}
 */
export async function sendWhatsAppText(text) {
  if (!isWhatsAppConfigured()) {
    return { ok: false, reason: "notConfigured" };
  }

  if (isWhatsAppRateLimited()) {
    const mins = Math.ceil((getWhatsAppRateLimitedUntil() - Date.now()) / 60000);
    return {
      ok: false,
      reason: "rateLimited",
      queued: true,
      body: `CallMeBot en cooldown ~${mins} min (evitar cola)`,
    };
  }

  await waitSendGap();

  const phone = normalizePhone(process.env.WHATSAPP_PHONE);
  const apikey = String(process.env.WHATSAPP_APIKEY || "").trim();

  const url =
    `https://api.callmebot.com/whatsapp.php` +
    `?phone=${encodeURIComponent(phone)}` +
    `&text=${encodeURIComponent(text)}` +
    `&apikey=${encodeURIComponent(apikey)}`;

  let last = { ok: false, reason: "unknown" };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; IPS-Bot/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(25000),
      });
      const body = await res.text().catch(() => "");
      const snippet = body.slice(0, 500);
      const { queued, immediate } = classifyCallMeBotBody(res.status, body);

      if (res.status >= 200 && res.status < 300) {
        writeLastSendAt();

        if (queued) {
          markWhatsAppRateLimited();
          console.warn(
            "📱 CallMeBot: EN COLA — no confío en demora; uso fallback mail para alertas críticas."
          );
        }

        return {
          ok: true,
          status: res.status,
          body: snippet,
          queued,
          immediate: immediate && !queued,
        };
      }

      last = {
        ok: false,
        status: res.status,
        body: snippet,
        reason: `http${res.status}`,
      };

      if (res.status === 403 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      break;
    } catch (err) {
      last = { ok: false, reason: "error", body: err.message };
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
    }
  }

  return last;
}
