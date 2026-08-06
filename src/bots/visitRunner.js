import puppeteer from "puppeteer";
import { getRandomUserAgent } from "../utils/conversions.js";
import { logStatus } from "../utils/logging.js";
import { emitStatus } from "../utils/socket.js";
import { resolveBrowserExecutablePath } from "../utils/browserPath.js";

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--disable-extensions",
  "--mute-audio",
  "--no-default-browser-check",
  "--lang=es-AR",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function softenAutomation(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", {
      get: () => ["es-AR", "es", "en"],
    });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
  });
}

async function dismissCookieBanner(page, platformId) {
  const selectors =
    platformId === "facebook"
      ? [
          'button[data-cookiebanner="accept_button"]',
          'button[title*="Allow"]',
          'button[title*="Aceptar"]',
          '[aria-label*="Allow all"]',
          '[aria-label*="Aceptar"]',
        ]
      : [
          'button[data-testid="action:understood-button"]',
          'button[data-testid="cookie-banner-accept"]',
          "#cookie-disclaimer-btn",
          'button[aria-label*="Aceptar"]',
        ];

  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await sleep(500);
        return;
      }
    } catch {
      // ignore
    }
  }

  try {
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button")];
      const accept = buttons.find((b) =>
        /aceptar|entendido|accept|allow|consent|permitir/i.test(b.textContent || "")
      );
      accept?.click();
    });
  } catch {
    // ignore
  }
}

async function simulateHumanBrowse(page) {
  const steps = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < steps; i++) {
    await page.evaluate((ratio) => {
      const max = Math.max(
        document.body?.scrollHeight || 0,
        document.documentElement?.scrollHeight || 0
      );
      window.scrollTo({ top: Math.floor(max * ratio), behavior: "smooth" });
    }, 0.15 + i * 0.18);
    await sleep(800 + Math.random() * 1200);
  }

  try {
    await page.mouse.move(200 + Math.random() * 400, 200 + Math.random() * 300);
    await sleep(300);
  } catch {
    // ignore
  }
}

/**
 * Loop infinito de visitas para UNA plataforma (ML o FB).
 * Cada llamada corre en paralelo con la otra (dos “hilos” async).
 */
export function createVisitBot(platform) {
  let currentIndex = 0;
  let visitCounter = 0;

  async function visitUrl(io, url, productName) {
    let browser;
    const tag = `[${platform.short}]`;

    try {
      console.log(`${tag} 🌐 Abriendo: ${productName}`);
      console.log(`${tag} 🔗 ${url}`);

      const executablePath = resolveBrowserExecutablePath();
      if (executablePath) {
        console.log(`${tag} 🧭 Browser: ${executablePath}`);
      }

      browser = await puppeteer.launch({
        headless: "new",
        protocolTimeout: 90000,
        args: LAUNCH_ARGS,
        executablePath,
        ignoreDefaultArgs: ["--enable-automation"],
      });

      const page = await browser.newPage();
      await softenAutomation(page);
      await page.setExtraHTTPHeaders({
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      });
      await page.setUserAgent(getRandomUserAgent());
      await page.setViewport({
        width: 1366 + Math.floor(Math.random() * 120),
        height: 768 + Math.floor(Math.random() * 80),
        deviceScaleFactor: 1,
      });
      page.setDefaultNavigationTimeout(platform.navTimeoutMs);

      const response = await page.goto(url, {
        waitUntil: platform.waitUntil || "load",
        timeout: platform.navTimeoutMs,
      });

      if (!response) {
        throw new Error(`Sin respuesta al cargar: ${url}`);
      }

      const status = response.status();
      // FB a veces redirige / login wall con 200 igual
      if (status >= 400) {
        throw new Error(`HTTP ${status} al cargar: ${url}`);
      }

      await dismissCookieBanner(page, platform.id);
      await simulateHumanBrowse(page);
      await sleep(platform.stayOnPageMs);

      try {
        await page.waitForNetworkIdle({ idleTime: 1000, timeout: 5000 });
      } catch {
        // ok
      }

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
      console.log(`${tag} ✅ OK - Status: ${status} - ${productName}`);
    } catch (error) {
      console.error(`${tag} ❌ Fail ${productName}:`, error.message);
      logStatus(currentIndex + 1, "fallida", `${platform.short}:${productName}`, error);
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
      console.log(`${tag} ----------------------------------------------------------------`);
    }
  }

  async function run(io) {
    const productNames = Object.keys(platform.urls || {});
    if (!productNames.length) {
      console.log(`[${platform.short}] Sin URLs configuradas — bot idle`);
      return;
    }

    console.log(
      `[${platform.short}] 🚀 Bot activo · ${productNames.length} productos · ${platform.label}`
    );

    while (true) {
      if (currentIndex >= productNames.length) {
        currentIndex = 0;
        visitCounter++;
        console.log(`[${platform.short}] 🔄 Ciclo #${visitCounter}`);
      }

      const productName = productNames[currentIndex];
      const url = platform.urls[productName];
      await visitUrl(io, url, productName);
      currentIndex++;

      const jitter = Math.floor(Math.random() * (platform.pauseJitterMs || 0));
      await sleep((platform.pauseBetweenMs || 5000) + jitter);
    }
  }

  return { run, platform };
}
