import puppeteerVanilla from "puppeteer";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { getRandomUserAgent } from "../../utils/conversions.js";
import { resolveBrowserExecutablePath } from "../../utils/browserPath.js";

puppeteerExtra.use(StealthPlugin());

export const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--disable-extensions",
  "--mute-audio",
  "--no-default-browser-check",
  "--lang=es-AR",
  "--disable-blink-features=AutomationControlled",
  "--headless=new",
  "--window-size=1366,768",
];

/** Un browser a la vez (ML+FB en paralelo saturaban el host). */
let browserLock = Promise.resolve();
export function withBrowserLock(fn) {
  const prev = browserLock;
  let release;
  browserLock = new Promise((r) => {
    release = r;
  });
  return prev.then(fn).finally(() => release());
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isNavRaceError(err) {
  return /Execution context was destroyed|Target closed|Session closed|Navigating frame was detached|net::ERR_ABORTED|Requesting main frame too early/i.test(
    err?.message || ""
  );
}

export function isUsableHttpUrl(u) {
  return Boolean(u && /^https?:\/\//i.test(u) && !/^about:/i.test(u));
}

export function resolveUserAgent(executablePath) {
  if (executablePath && /msedge/i.test(executablePath)) {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
  }
  if (executablePath && /chrome\.exe$/i.test(executablePath)) {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  }
  const ua = getRandomUserAgent();
  if (/Firefox|Android|iPhone/i.test(ua)) {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  }
  return ua;
}

export async function softenAutomation(page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", {
      get: () => ["es-AR", "es", "en-US", "en"],
    });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    window.chrome = window.chrome || { runtime: {} };
  });
}

export async function dismissCookieBanner(page, platformId) {
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
        await sleep(400);
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

export async function simulateHumanBrowse(page) {
  const steps = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < steps; i++) {
    try {
      await page.evaluate((ratio) => {
        const max = Math.max(
          document.body?.scrollHeight || 0,
          document.documentElement?.scrollHeight || 0
        );
        window.scrollTo({ top: Math.floor(max * ratio), behavior: "smooth" });
      }, 0.15 + i * 0.18);
    } catch (err) {
      if (isNavRaceError(err)) {
        await sleep(500);
        continue;
      }
      throw err;
    }
    await sleep(600 + Math.random() * 700);
  }

  try {
    await page.mouse.move(200 + Math.random() * 400, 200 + Math.random() * 300);
    await sleep(250);
  } catch {
    // ignore
  }
}

export async function readPageUrl(page) {
  try {
    return page.url();
  } catch {
    return "";
  }
}

export async function safeGoto(page, url, { waitUntil, timeout, referer } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const opts = {
        waitUntil: waitUntil || "domcontentloaded",
        timeout,
      };
      if (referer) opts.referer = referer;

      let response = null;
      try {
        response = await page.goto(url, opts);
      } catch (err) {
        if (!isNavRaceError(err)) throw err;
        await sleep(1200);
      }

      await sleep(800);

      const finalUrl = await readPageUrl(page);
      if (response) {
        const status = response.status();
        if (status >= 400) {
          throw new Error(`HTTP ${status} al cargar: ${finalUrl || url}`);
        }
        return { response, status, finalUrl };
      }

      if (isUsableHttpUrl(finalUrl)) {
        return { response: null, status: 200, finalUrl };
      }

      throw new Error(`Sin respuesta al cargar: ${url}`);
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        await sleep(1000 * attempt);
        continue;
      }
    }
  }

  const finalUrl = await readPageUrl(page);
  if (isUsableHttpUrl(finalUrl)) {
    return { response: null, status: 200, finalUrl };
  }

  throw lastError || new Error(`Sin respuesta al cargar: ${url}`);
}

/**
 * Lanza browser headless listo para una visita.
 * @returns {{ browser, page, executablePath, usePlainBundle }}
 */
export async function launchVisitBrowser({
  preferChrome = true,
  usePlainBundle = false,
  mobileViewport = false,
  navTimeoutMs = 60000,
  tag = "",
} = {}) {
  const launcher = usePlainBundle ? puppeteerVanilla : puppeteerExtra;
  const executablePath = usePlainBundle
    ? undefined
    : resolveBrowserExecutablePath({ preferChrome });

  if (executablePath) {
    console.log(`${tag} 🧭 Browser: ${executablePath}`);
  } else if (usePlainBundle) {
    console.log(`${tag} 🧭 Browser: Chromium bundled (plain, sin stealth)`);
  }

  const launchOpts = {
    headless: "new",
    protocolTimeout: 90000,
    args: LAUNCH_ARGS,
    ignoreDefaultArgs: ["--enable-automation"],
    defaultViewport: mobileViewport
      ? {
          width: 390,
          height: 844,
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        }
      : {
          width: 1366,
          height: 768,
          deviceScaleFactor: 1,
        },
  };
  if (executablePath) launchOpts.executablePath = executablePath;

  const browser = await launcher.launch(launchOpts);
  await sleep(300);
  const page = await browser.newPage();

  if (!usePlainBundle) {
    await softenAutomation(page);
  }

  await page.setExtraHTTPHeaders({
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  });

  page.setDefaultNavigationTimeout(navTimeoutMs);

  return { browser, page, executablePath, usePlainBundle };
}

export { resolveBrowserExecutablePath };
