import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteerVanilla from "puppeteer";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { getRandomUserAgent } from "../utils/conversions.js";
import { logStatus } from "../utils/logging.js";
import { emitStatus } from "../utils/socket.js";
import { resolveBrowserExecutablePath } from "../utils/browserPath.js";

puppeteerExtra.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");
const ML_PROFILE_DIR = path.join(ROOT_DIR, "data", "browser-profiles", "mercadolibre");

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--disable-extensions",
  "--mute-audio",
  "--no-default-browser-check",
  "--lang=es-AR",
  "--disable-blink-features=AutomationControlled",
  // Forzar headless aunque el binario/system diga otra cosa
  "--headless=new",
  "--window-size=1366,768",
];

/** Un browser a la vez: ML+FB en paralelo saturaban Edge/Chrome. */
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
  return /Execution context was destroyed|Target closed|Session closed|Navigating frame was detached|net::ERR_ABORTED|Requesting main frame too early/i.test(
    err?.message || ""
  );
}

function isUsableHttpUrl(u) {
  return Boolean(u && /^https?:\/\//i.test(u) && !/^about:/i.test(u));
}

function resolveUserAgent(executablePath) {
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

function resolveUrlEntry(entry) {
  if (typeof entry === "string") {
    return { url: entry, weight: 1 };
  }
  return {
    url: entry.url,
    weight: Math.max(1, Number(entry.weight) || 1),
  };
}

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
      get: () => ["es-AR", "es", "en-US", "en"],
    });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    window.chrome = window.chrome || { runtime: {} };
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

async function readPageUrl(page) {
  try {
    return page.url();
  } catch {
    return "";
  }
}

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

/* -------------------- Facebook (sin cambios de enfoque) -------------------- */

async function openFacebookListing(page, itemUrl, navTimeoutMs) {
  const hubUrl = "https://www.facebook.com/marketplace/?ref=app_tab";

  try {
    await page.goto(hubUrl, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(navTimeoutMs, 40000),
    });
    await dismissCookieBanner(page, "facebook");
    await sleep(1000 + Math.random() * 1000);
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
      href: location.href || "",
      hasPrice: /\$\s?\d|ARS\s*\d|USD\s*\d|\d[\d.]*\s*(ARS|USD)/i.test(text),
      hasMessage:
        /enviar mensaje|message seller|enviar un mensaje|\bmessage\b/i.test(text),
      hasUnavailable:
        /no disponible|no longer available|contenido no disponible|esta publicaci[oó]n no est/i.test(
          text
        ),
      snippet: text.slice(0, 180),
    };
  });
}

function looksLikeFbMarketplaceListing(url, title) {
  const onItem = /marketplace\/item\//i.test(url || "");
  const titleOk =
    /marketplace/i.test(title || "") ||
    (Boolean(title) &&
      title.length > 20 &&
      !/^facebook$/i.test(title.trim()) &&
      !/log\s?in|iniciar sesi/i.test(title));
  return onItem && titleOk;
}

async function assertFacebookListingLoaded(page, productName) {
  const finalUrl = await readPageUrl(page);
  if (/\/login|checkpoint/i.test(finalUrl)) {
    throw new Error(`Redirigido a login/checkpoint: ${finalUrl}`);
  }

  let check = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    let pageTitle = "";
    let pageHref = finalUrl;
    try {
      pageTitle = await page.title();
      pageHref = (await readPageUrl(page)) || finalUrl;
      check = await probeFacebookListing(page);
    } catch (err) {
      if (isNavRaceError(err) && attempt < 5) {
        await sleep(800);
        continue;
      }
      throw err;
    }

    const title = check?.title || pageTitle || "";
    const href = check?.href || pageHref || "";

    if (check?.hasUnavailable) {
      throw new Error(`Publicación no disponible: ${productName}`);
    }

    const usable =
      check?.hasPrice ||
      check?.hasMessage ||
      looksLikeFbMarketplaceListing(href, title) ||
      looksLikeFbMarketplaceListing(pageHref, pageTitle);

    if (usable) {
      return {
        ...check,
        title,
        hasMarketplaceTitle: /marketplace/i.test(title),
        hasListingUrl: /marketplace\/item\//i.test(href || pageHref),
      };
    }

    await sleep(800 + attempt * 300);
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
      await sleep(600);
    }
  } catch {
    // ignore
  }

  await simulateHumanBrowse(page);

  try {
    await page.mouse.click(400 + Math.random() * 200, 320 + Math.random() * 120);
    await sleep(400);
  } catch {
    // ignore
  }
}

/* -------------------- MercadoLibre (flujo simple headless) -------------------- */

function isMercadoLibreBlockedUrl(url) {
  return /account-verification|captcha|challenge|security-check|\/jms\/|\/gz\/account/i.test(
    url || ""
  );
}

function isMercadoLibreProductUrl(url) {
  if (!url || isMercadoLibreBlockedUrl(url)) return false;
  // Producto típico: .../slug/up/MLAU... o item MLA
  return (
    /mercadolibre\.com\.[a-z]{2}/i.test(url) &&
    (/\/up\/ML/i.test(url) || /\/p\/ML/i.test(url) || /[?&]item_id=/i.test(url))
  );
}

/** Limpia perfil viejo (headed) que quedó quemado por challenges. */
function clearBurnedMlProfile() {
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
 * Esperamos poco + un retry go=. Sin ventanas ni esperas de 90s.
 */
async function ensureMercadoLibreProduct(page, originalUrl, navTimeoutMs) {
  let finalUrl = await readPageUrl(page);

  if (isMercadoLibreProductUrl(finalUrl)) {
    return finalUrl;
  }

  if (!isMercadoLibreBlockedUrl(finalUrl)) {
    // URL rara pero no challenge — si es mercadolibre, seguimos
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

  // Último intento: URL original
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

const mlCooldown = { blockedUntil: 0, consecutiveBlocks: 0 };
const DEFAULT_ML_STRATEGIES = [
  "direct",
  "mobile",
  "home_then_product",
  "plain_bundle",
];

/**
 * Loop infinito por plataforma.
 * ML = headless + rotación de estrategias anti-captcha (experimentos).
 * FB = hub → listing (como ahora, que anda).
 */
export function createVisitBot(platform) {
  let currentIndex = 0;
  let visitCounter = 0;
  let mlProfileCleared = false;
  let mlStrategyIndex = 0;

  function nextMlStrategy() {
    const list =
      platform.mlStrategies?.length > 0
        ? platform.mlStrategies
        : DEFAULT_ML_STRATEGIES;
    const strategy = list[mlStrategyIndex % list.length];
    mlStrategyIndex += 1;
    return strategy;
  }

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
        const launcher = usePlainBundle ? puppeteerVanilla : puppeteerExtra;

        // plain_bundle: Chromium de Puppeteer (sin Chrome del sistema)
        // resto: Chrome/Edge del sistema + stealth
        const executablePath = usePlainBundle
          ? undefined
          : resolveBrowserExecutablePath({
              // alterna Chrome / Edge según strategy
              preferChrome: strategy !== "home_then_product",
            });

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
          defaultViewport: usePlainBundle
            ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
            : {
                width: 1366,
                height: 768,
                deviceScaleFactor: 1,
              },
        };
        if (executablePath) launchOpts.executablePath = executablePath;

        // En mobile strategy, viewport móvil aunque no sea plain_bundle
        if (isMl && strategy === "mobile") {
          launchOpts.defaultViewport = {
            width: 390,
            height: 844,
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
          };
        }

        browser = await launcher.launch(launchOpts);

        console.log(`${tag} 👁️ headless=on · strategy=${isMl ? strategy : "fb"}`);
        await sleep(300);
        const page = await browser.newPage();

        if (!usePlainBundle) {
          await softenAutomation(page);
        }

        await page.setExtraHTTPHeaders({
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        });

        if (isMl && (strategy === "mobile" || usePlainBundle)) {
          await page.setUserAgent(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          );
        } else {
          await page.setUserAgent(resolveUserAgent(executablePath));
        }

        page.setDefaultNavigationTimeout(platform.navTimeoutMs);

        let nav;
        if (isMl) {
          nav = await openMercadoLibreListing(
            page,
            url,
            platform.navTimeoutMs,
            strategy === "plain_bundle" ? "mobile" : strategy
          );
        } else {
          nav = await openFacebookListing(page, url, platform.navTimeoutMs);
        }

        const status = nav.status;
        console.log(`${tag} 📍 Landed: ${nav.finalUrl} (HTTP ${status})`);

        await dismissCookieBanner(page, platform.id);

        if (isMl) {
          const finalUrl = await ensureMercadoLibreProduct(
            page,
            url,
            platform.navTimeoutMs
          );
          console.log(`${tag} 🛒 Producto: ${finalUrl} · strategy=${strategy}`);
          await simulateHumanBrowse(page);
          mlCooldown.consecutiveBlocks = 0;
        } else {
          const check = await assertFacebookListingLoaded(page, productName);
          console.log(
            `${tag} 📄 Listing OK · price=${check.hasPrice} msg=${check.hasMessage} mkt=${Boolean(check.hasMarketplaceTitle)} · ${page.url()}`
          );
          await interactFacebookListing(page);
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
          `${tag} ✅ OK - Status: ${status} - ${productName}${isMl ? ` [${strategy}]` : ""}`
        );
      } catch (error) {
        if (isMl && /verification|captcha|bloqueo/i.test(error.message || "")) {
          mlCooldown.consecutiveBlocks += 1;
          const cool =
            (platform.blockCooldownMs || 90000) *
            Math.min(mlCooldown.consecutiveBlocks, 3);
          mlCooldown.blockedUntil = Date.now() + cool;
          console.log(
            `${tag} 🧊 Block #${mlCooldown.consecutiveBlocks} strategy=${strategy} → cooldown ${Math.round(cool / 1000)}s — próximo intenta otra strategy`
          );
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
        console.log(`${tag} ----------------------------------------------------------------`);
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
      console.log(
        `[ML] 💡 Experimentos headless rotando: ${list.join(" → ")}`
      );
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
