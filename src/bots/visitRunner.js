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

/**
 * Un solo Edge a la vez (ML+FB en paralelo saturaban launch/goto →
 * "Sin respuesta" / "Execution context was destroyed").
 */
let browserLock = Promise.resolve();
function withBrowserLock(fn) {
  const prev = browserLock;
  let release;
  browserLock = new Promise((r) => {
    release = r;
  });
  return prev.then(fn).finally(() => release());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNavRaceError(err) {
  return /Execution context was destroyed|Target closed|Session closed|Navigating frame was detached|net::ERR_ABORTED/i.test(
    err?.message || ""
  );
}

function isUsableHttpUrl(u) {
  return Boolean(u && /^https?:\/\//i.test(u) && !/^about:/i.test(u));
}

function resolveUrlEntry(entry) {
  if (typeof entry === "string") {
    return { url: entry, weight: 1 };
  }
  return {
    url: entry.url,
    weight: Math.max(1, Number(entry.weight) || 1),
  };
}

/** Cola 1:1 por producto (weight opcional, default 1 — trato uniforme). */
function buildVisitQueue(urlsMap) {
  const queue = [];
  for (const [productName, entry] of Object.entries(urlsMap || {})) {
    const { url, weight } = resolveUrlEntry(entry);
    for (let i = 0; i < weight; i++) {
      queue.push({ productName, url });
    }
  }
  return queue;
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
        await sleep(800);
        continue;
      }
      throw err;
    }
    await sleep(700 + Math.random() * 900);
  }

  try {
    await page.mouse.move(200 + Math.random() * 400, 200 + Math.random() * 300);
    await sleep(300);
  } catch {
    // ignore
  }
}

async function readPageUrl(page) {
  try {
    return page.url();
  } catch {
    return "";
  }
}

/**
 * goto resiliente: ML redirige y a menudo response=null / context destroyed.
 * No usamos waitForNavigation post-goto (compite con redirects de ML).
 */
async function safeGoto(page, url, { waitUntil, timeout, referer } = {}) {
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
        // Redirect mid-goto: esperar a que asiente y seguir
        await sleep(2000);
      }

      await sleep(2000);

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
        await sleep(1500 * attempt);
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
 * FB Marketplace cuenta mejor “clics” cuando la visita llega como desde el feed,
 * no solo con deep-link directo al item.
 */
async function openFacebookListing(page, itemUrl, navTimeoutMs) {
  const hubUrl = "https://www.facebook.com/marketplace/?ref=app_tab";

  try {
    await page.goto(hubUrl, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(navTimeoutMs, 45000),
    });
    await dismissCookieBanner(page, "facebook");
    await sleep(1500 + Math.random() * 1500);
  } catch (err) {
    console.log(`[FB] ⚠️ Hub Marketplace: ${err.message} — sigo al item`);
  }

  return safeGoto(page, itemUrl, {
    waitUntil: "domcontentloaded",
    timeout: navTimeoutMs,
    referer: hubUrl,
  });
}

async function probeFacebookListing(page) {
  return page.evaluate(() => {
    const text = (document.body?.innerText || "").replace(/\s+/g, " ");
    const title = document.title || "";
    return {
      title,
      hasPrice: /\$\s?\d|ARS\s*\d|USD\s*\d|\d[\d.]*\s*(ARS|USD)/i.test(text),
      hasMessage:
        /enviar mensaje|message seller|enviar un mensaje|message/i.test(text),
      hasMarketplaceTitle: /facebook\s*marketplace/i.test(title),
      hasListingUrl: /marketplace\/item\//i.test(location.href),
      hasUnavailable:
        /no disponible|no longer available|contenido no disponible|esta publicaci[oó]n no est/i.test(
          text
        ),
      snippet: text.slice(0, 180),
    };
  });
}

/**
 * FB a menudo setea el <title> del listing antes de pintar precio/CTA.
 * Reintentamos y aceptamos título Marketplace + URL de item como OK.
 */
async function assertFacebookListingLoaded(page, productName) {
  const finalUrl = await readPageUrl(page);
  if (/\/login|checkpoint/i.test(finalUrl)) {
    throw new Error(`Redirigido a login/checkpoint: ${finalUrl}`);
  }

  let check = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      check = await probeFacebookListing(page);
    } catch (err) {
      if (isNavRaceError(err) && attempt < 4) {
        await sleep(1200);
        continue;
      }
      throw err;
    }

    if (check.hasUnavailable) {
      throw new Error(`Publicación no disponible: ${productName}`);
    }

    const usable =
      check.hasPrice ||
      check.hasMessage ||
      (check.hasMarketplaceTitle && check.hasListingUrl) ||
      (check.hasListingUrl &&
        check.title &&
        !/^facebook$/i.test(check.title.trim()));

    if (usable) {
      return check;
    }

    await sleep(1200 + attempt * 400);
  }

  throw new Error(
    `Listing FB sin contenido usable (${productName}): ${check?.title || check?.snippet || "vacío"}`
  );
}

async function interactFacebookListing(page) {
  try {
    const img = await page.$('img[src*="scontent"], img[alt]');
    if (img) {
      await img.click({ delay: 40 }).catch(() => {});
      await sleep(800);
    }
  } catch {
    // ignore
  }

  await simulateHumanBrowse(page);

  try {
    await page.mouse.click(400 + Math.random() * 200, 320 + Math.random() * 120);
    await sleep(500);
  } catch {
    // ignore
  }
}

/**
 * Loop infinito de visitas para UNA plataforma (ML o FB).
 * Los browsers se serializan con withBrowserLock (no dos Edge a la vez).
 */
export function createVisitBot(platform) {
  let currentIndex = 0;
  let visitCounter = 0;

  async function visitUrl(io, url, productName) {
    return withBrowserLock(async () => {
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

        let nav;
        if (platform.id === "facebook") {
          nav = await openFacebookListing(page, url, platform.navTimeoutMs);
        } else {
          nav = await safeGoto(page, url, {
            waitUntil: platform.waitUntil || "domcontentloaded",
            timeout: platform.navTimeoutMs,
          });
        }

        const status = nav.status;
        console.log(`${tag} 📍 Landed: ${nav.finalUrl} (HTTP ${status})`);

        await dismissCookieBanner(page, platform.id);

        if (platform.id === "facebook") {
          const check = await assertFacebookListingLoaded(page, productName);
        console.log(
          `${tag} 📄 Listing OK · price=${check.hasPrice} msg=${check.hasMessage} title=${Boolean(check.hasMarketplaceTitle)} · ${page.url()}`
        );
          await interactFacebookListing(page);
        } else {
          const finalUrl = await readPageUrl(page);
          if (/\/login|checkpoint/i.test(finalUrl)) {
            throw new Error(`Redirigido a login/checkpoint: ${finalUrl}`);
          }
          await simulateHumanBrowse(page);
        }

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
        // ML: si la carrera de redirect dejó la página en el producto, cuenta como vista
        if (
          platform.id === "mercadolibre" &&
          isNavRaceError(error) &&
          browser
        ) {
          try {
            const pages = await browser.pages();
            const u = pages[0] ? await readPageUrl(pages[0]) : "";
            if (/mercadolibre\.com/i.test(u) && !/\/login|checkpoint/i.test(u)) {
              console.log(
                `${tag} ⚠️ Race de nav tolerada · ${u} — cuento como OK`
              );
              logStatus(
                currentIndex + 1,
                "abierta",
                `${platform.short}:${productName}`
              );
              await emitStatus(
                io,
                currentIndex + 1,
                "ok",
                productName,
                url,
                null,
                platform.id
              );
              console.log(`${tag} ✅ OK - Status: 200 - ${productName}`);
              return;
            }
          } catch {
            // caer al fail normal
          }
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
