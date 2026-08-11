/**
 * CallMeBot — WhatsApp personal.
 * https://www.callmebot.com/blog/free-api-whatsapp-messages/
 */

function envFlag(name, fallback = false) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
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

function looksQueued(body) {
  return /message queued|sent|apikey/i.test(String(body || ""));
}

/**
 * @param {string} text
 * @returns {Promise<{ ok: boolean, status?: number, body?: string, reason?: string }>}
 */
export async function sendWhatsAppText(text) {
  if (!isWhatsAppConfigured()) {
    return { ok: false, reason: "notConfigured" };
  }

  const phone = normalizePhone(process.env.WHATSAPP_PHONE);
  const apikey = String(process.env.WHATSAPP_APIKEY || "").trim();

  // CallMeBot: GET simple phone+text+apikey (sin source custom → a veces 403)
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
      const snippet = body.slice(0, 400);

      if (res.ok && (looksQueued(body) || body.length < 500)) {
        return { ok: true, status: res.status, body: snippet };
      }

      last = {
        ok: false,
        status: res.status,
        body: snippet,
        reason: res.ok ? "unexpectedBody" : `http${res.status}`,
      };

      // 403 intermitente: esperar y reintentar
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
