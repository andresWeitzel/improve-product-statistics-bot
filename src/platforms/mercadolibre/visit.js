import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  sleep,
  safeGoto,
  dismissCookieBanner,
  simulateHumanBrowse,
  readPageUrl,
  isUsableHttpUrl,
} from "../shared/browser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../..");
const ML_PROFILE_DIR = path.join(ROOT_DIR, "data", "browser-profiles", "mercadolibre");

export const DEFAULT_ML_STRATEGIES = [
  "direct",
  "mobile",
  "home_then_product",
  "plain_bundle",
];

export const mlCooldown = { blockedUntil: 0, consecutiveBlocks: 0 };

export function isMercadoLibreBlockedUrl(url) {
  return /account-verification|captcha|challenge|security-check|\/jms\/|\/gz\/account/i.test(
    url || ""
  );
}

export function isMercadoLibreProductUrl(url) {
  if (!url || isMercadoLibreBlockedUrl(url)) return false;
  return (
    /mercadolibre\.com\.[a-z]{2}/i.test(url) &&
    (/\/up\/ML/i.test(url) || /\/p\/ML/i.test(url) || /[?&]item_id=/i.test(url))
  );
}

/** Limpia perfil viejo (headed) que quedó quemado por challenges. */
export function clearBurnedMlProfile() {
  try {
    if (fs.existsSync(ML_PROFILE_DIR)) {
      fs.rmSync(ML_PROFILE_DIR, { recursive: true, force: true });
      console.log(`[ML] 🧹 Perfil viejo eliminado (sesión headed quemada)`);
    }
  } catch (err) {
    console.log(`[ML] ⚠️ No pude limpiar perfil: ${err.message}`);
  }
}

/**
 * Goto según estrategia experimental (rotan si hay captcha).
 * - direct: URL desktop
 * - mobile: m.mercadolibre.com.ar
 * - home_then_product: home → producto (referrer real)
 */
async function openMercadoLibreListing(page, itemUrl, navTimeoutMs, strategy) {
  if (strategy === "mobile") {
    const mobileUrl = itemUrl.replace(
      /:\/\/www\.mercadolibre\./i,
      "://m.mercadolibre."
    );
    console.log(`[ML] 🧪 strategy=mobile`);
    return safeGoto(page, mobileUrl, {
      waitUntil: "domcontentloaded",
      timeout: navTimeoutMs,
    });
  }

  if (strategy === "home_then_product") {
    const homeUrl = "https://www.mercadolibre.com.ar/";
    console.log(`[ML] 🧪 strategy=home_then_product`);
    try {
      await page.goto(homeUrl, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(navTimeoutMs, 35000),
      });
      await dismissCookieBanner(page, "mercadolibre");
      await sleep(1200 + Math.random() * 800);
    } catch (err) {
      console.log(`[ML] ⚠️ Home: ${err.message}`);
    }
    return safeGoto(page, itemUrl, {
      waitUntil: "domcontentloaded",
      timeout: navTimeoutMs,
      referer: homeUrl,
    });
  }

  console.log(`[ML] 🧪 strategy=direct`);
  return safeGoto(page, itemUrl, {
    waitUntil: "domcontentloaded",
    timeout: navTimeoutMs,
  });
}

/**
 * Challenge blando: a veces ML redirige solo en unos segundos.
 */
async function ensureMercadoLibreProduct(page, originalUrl, navTimeoutMs) {
  let finalUrl = await readPageUrl(page);

  if (isMercadoLibreProductUrl(finalUrl)) {
    return finalUrl;
  }

  if (!isMercadoLibreBlockedUrl(finalUrl)) {
    if (/mercadolibre\.com/i.test(finalUrl) && !/\/login/i.test(finalUrl)) {
      return finalUrl;
    }
  }

  if (isMercadoLibreBlockedUrl(finalUrl)) {
    console.log(`[ML] ⚠️ Challenge detectado — espero redirect corto (8s)...`);
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      await sleep(1000);
      finalUrl = await readPageUrl(page);
      if (isMercadoLibreProductUrl(finalUrl)) {
        console.log(`[ML] ✅ Challenge auto-resuelto → ${finalUrl}`);
        return finalUrl;
      }
    }

    try {
      const go = new URL(finalUrl).searchParams.get("go");
      if (go) {
        const target = decodeURIComponent(go);
        console.log(`[ML] ↪️ Retry producto: ${target}`);
        await safeGoto(page, target, {
          waitUntil: "domcontentloaded",
          timeout: Math.min(navTimeoutMs, 35000),
        });
        await sleep(2000);
        finalUrl = await readPageUrl(page);
        if (isMercadoLibreProductUrl(finalUrl)) {
          return finalUrl;
        }
      }
    } catch (err) {
      console.log(`[ML] ⚠️ Retry go= falló: ${err.message}`);
    }
  }

  if (isMercadoLibreBlockedUrl(finalUrl)) {
    throw new Error(`ML bloqueó la visita (verification/captcha): ${finalUrl}`);
  }

  if (!isMercadoLibreProductUrl(finalUrl)) {
    await safeGoto(page, originalUrl, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(navTimeoutMs, 35000),
    });
    finalUrl = await readPageUrl(page);
  }

  if (isMercadoLibreBlockedUrl(finalUrl) || !isUsableHttpUrl(finalUrl)) {
    throw new Error(`ML bloqueó la visita (verification/captcha): ${finalUrl}`);
  }

  return finalUrl;
}

export function createMlStrategyRotator(platform) {
  let mlStrategyIndex = 0;
  return function nextMlStrategy() {
    const list =
      platform.mlStrategies?.length > 0
        ? platform.mlStrategies
        : DEFAULT_ML_STRATEGIES;
    const strategy = list[mlStrategyIndex % list.length];
    mlStrategyIndex += 1;
    return strategy;
  };
}

export function applyMlBlockCooldown(platform, strategy, tag) {
  mlCooldown.consecutiveBlocks += 1;
  const cool =
    (platform.blockCooldownMs || 90000) *
    Math.min(mlCooldown.consecutiveBlocks, 3);
  mlCooldown.blockedUntil = Date.now() + cool;
  console.log(
    `${tag} 🧊 Block #${mlCooldown.consecutiveBlocks} strategy=${strategy} → cooldown ${Math.round(cool / 1000)}s — próximo intenta otra strategy`
  );
}

/**
 * Visita un producto MercadoLibre (estrategias anti-captcha).
 */
export async function runMercadoLibreVisit({
  page,
  url,
  navTimeoutMs,
  strategy,
  tag,
}) {
  const openStrategy = strategy === "plain_bundle" ? "mobile" : strategy;
  const nav = await openMercadoLibreListing(
    page,
    url,
    navTimeoutMs,
    openStrategy
  );
  console.log(`${tag} 📍 Landed: ${nav.finalUrl} (HTTP ${nav.status})`);

  await dismissCookieBanner(page, "mercadolibre");

  const finalUrl = await ensureMercadoLibreProduct(page, url, navTimeoutMs);
  console.log(`${tag} 🛒 Producto: ${finalUrl} · strategy=${strategy}`);
  await simulateHumanBrowse(page);
  mlCooldown.consecutiveBlocks = 0;

  return nav;
}
