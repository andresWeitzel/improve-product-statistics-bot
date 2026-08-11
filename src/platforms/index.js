import { logStatus } from "../utils/logging.js";
import { emitStatus } from "../utils/socket.js";
import { facebookConfig } from "./facebook/config.js";
import { runFacebookVisit } from "./facebook/visit.js";
import { mercadolibreConfig } from "./mercadolibre/config.js";
import {
  DEFAULT_ML_STRATEGIES,
  mlCooldown,
  clearBurnedMlProfile,
  createMlStrategyRotator,
  applyMlBlockCooldown,
  runMercadoLibreVisit,
} from "./mercadolibre/visit.js";
import {
  sleep,
  withBrowserLock,
  resolveUserAgent,
  launchVisitBrowser,
} from "./shared/browser.js";
import { buildVisitQueue } from "./shared/queue.js";

export const platforms = {
  mercadolibre: mercadolibreConfig,
  facebook: facebookConfig,
};

/**
 * Loop infinito por plataforma.
 * ML = headless + rotación de estrategias anti-captcha.
 * FB = hub → listing.
 */
export function createVisitBot(platform) {
  let currentIndex = 0;
  let visitCounter = 0;
  let mlProfileCleared = false;
  const nextMlStrategy = createMlStrategyRotator(platform);

  async function visitUrl(io, url, productName) {
    return withBrowserLock(async () => {
      let browser;
      const tag = `[${platform.short}]`;
      const isMl = platform.id === "mercadolibre";
      let strategy = "direct";

      if (isMl && Date.now() < mlCooldown.blockedUntil) {
        const waitSec = Math.ceil((mlCooldown.blockedUntil - Date.now()) / 1000);
        console.log(
          `${tag} ⏸️ Cooldown verification (${waitSec}s) — salteo ${productName}`
        );
        return;
      }

      try {
        console.log(`${tag} 🌐 Abriendo: ${productName}`);
        console.log(`${tag} 🔗 ${url}`);

        if (isMl && !mlProfileCleared) {
          clearBurnedMlProfile();
          mlProfileCleared = true;
        }

        if (isMl) {
          strategy = nextMlStrategy();
        }

        const usePlainBundle = isMl && strategy === "plain_bundle";
        const mobileViewport =
          usePlainBundle || (isMl && strategy === "mobile");

        const launched = await launchVisitBrowser({
          preferChrome: strategy !== "home_then_product",
          usePlainBundle,
          mobileViewport,
          navTimeoutMs: platform.navTimeoutMs,
          tag,
        });
        browser = launched.browser;
        const { page, executablePath } = launched;

        console.log(
          `${tag} 👁️ headless=on · strategy=${isMl ? strategy : "fb"}`
        );

        if (isMl && (strategy === "mobile" || usePlainBundle)) {
          await page.setUserAgent(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          );
        } else {
          await page.setUserAgent(resolveUserAgent(executablePath));
        }

        let nav;
        if (isMl) {
          nav = await runMercadoLibreVisit({
            page,
            url,
            navTimeoutMs: platform.navTimeoutMs,
            strategy,
            tag,
          });
        } else {
          nav = await runFacebookVisit({
            page,
            url,
            productName,
            navTimeoutMs: platform.navTimeoutMs,
            tag,
          });
        }

        await sleep(platform.stayOnPageMs);

        logStatus(currentIndex + 1, "abierta", `${platform.short}:${productName}`);
        await emitStatus(
          io,
          currentIndex + 1,
          "ok",
          productName,
          url,
          null,
          platform.id
        );
        console.log(
          `${tag} ✅ OK - Status: ${nav.status} - ${productName}${isMl ? ` [${strategy}]` : ""}`
        );
      } catch (error) {
        if (isMl && /verification|captcha|bloqueo/i.test(error.message || "")) {
          applyMlBlockCooldown(platform, strategy, tag);
        }

        console.error(`${tag} ❌ Fail ${productName}:`, error.message);
        logStatus(
          currentIndex + 1,
          "fallida",
          `${platform.short}:${productName}`,
          error
        );
        await emitStatus(
          io,
          currentIndex + 1,
          "fail",
          productName,
          url,
          error?.message,
          platform.id
        );
      } finally {
        if (browser) {
          try {
            await browser.close();
            console.log(`${tag} 🔒 Navegador cerrado`);
          } catch (closeError) {
            console.log(`${tag} ⚠️ Close error:`, closeError.message);
          }
        }
        console.log(
          `${tag} ----------------------------------------------------------------`
        );
      }
    });
  }

  async function run(io) {
    const queue = buildVisitQueue(platform.urls);
    if (!queue.length) {
      console.log(`[${platform.short}] Sin URLs configuradas — bot idle`);
      return;
    }

    console.log(
      `[${platform.short}] 🚀 Bot activo · ${queue.length} links · ${platform.label}`
    );
    if (platform.id === "mercadolibre") {
      const list = platform.mlStrategies || DEFAULT_ML_STRATEGIES;
      console.log(`[ML] 💡 Experimentos headless rotando: ${list.join(" → ")}`);
    }

    while (true) {
      if (currentIndex >= queue.length) {
        currentIndex = 0;
        visitCounter++;
        console.log(`[${platform.short}] 🔄 Ciclo #${visitCounter}`);
      }

      const { productName, url } = queue[currentIndex];
      await visitUrl(io, url, productName);
      currentIndex++;

      const jitter = Math.floor(Math.random() * (platform.pauseJitterMs || 0));
      await sleep((platform.pauseBetweenMs || 5000) + jitter);
    }
  }

  return { run, platform };
}
