import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { getRandomUserAgent } from "../utils/conversions.js";
import { logStatus } from "../utils/logging.js";
import { emitStatus } from "../utils/socket.js";
import { resolveBrowserExecutablePath } from "../utils/browserPath.js";

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../..");
const PROFILES_DIR = path.join(ROOT_DIR, "data", "browser-profiles");

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
];

/** UA coherente con el binario (evitar Firefox UA sobre Chromium). */
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

function profileDirFor(platformId) {
  const dir = path.join(PROFILES_DIR, platformId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Un solo browser a la vez (ML+FB en paralelo saturaban launch).
 * La visita completa no debe bloquear > ~navTimeout + stay + pausas cortas.
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
  return /Execution context was destroyed|Target closed|Session closed|Navigating frame was detached|net::ERR_ABORTED|Requesting main frame too early/i.test(
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

/**
 * goto resiliente: ML/FB a veces response=null por redirects.
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
        await sleep(1500);
      }

      await sleep(1000);

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
        await sleep(1200 * attempt);
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

function isMercadoLibreBlockedUrl(url) {
  return /account-verification|captcha|challenge|security-check|\/jms\/|\/gz\/account/i.test(
    url || ""
  );
}

/** Directo al producto (menos hits a ML que home→item). */
async function openMercadoLibreListing(page, itemUrl, navTimeoutMs) {
  return safeGoto(page, itemUrl, {
    waitUntil: "domcontentloaded",
    timeout: navTimeoutMs,
    referer: "https://www.google.com.ar/",
  });
}

function resolveHeadless(platformId) {
  if (process.env.HEADLESS === "1") return "new";
  if (process.env.HEADLESS === "0") return false;
  // ML: browser real (sesión caliente). FB: headless.
  if (platformId === "mercadolibre") return false;
  return "new";
}

/** Minimizar / restaurar ventana (Chrome CDP). */
async function setWindowMinimized(page, minimized) {
  try {
    const client = await page.target().createCDPSession();
    const { windowId } = await client.send("Browser.getWindowForTarget");
    await client.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: minimized ? "minimized" : "normal" },
    });
  } catch (err) {
    console.log(`[ML] ⚠️ Ventana: ${err.message}`);
  }
}

/**
 * Si ML manda a verification:
 * - headed: restaura ventana un rato para completar challenge (sesión caliente)
 * - luego vuelve a minimizar
 */
async function ensureMercadoLibreProduct(page, originalUrl, navTimeoutMs, { headed }) {
  let finalUrl = await readPageUrl(page);

  if (!isMercadoLibreBlockedUrl(finalUrl)) {
    return finalUrl;
  }

  console.log(`[ML] ⚠️ Challenge/bloqueo: ${finalUrl}`);

  if (headed) {
    console.log(
      `[ML] 👤 Restaurando ventana 60s — completá el challenge si hace falta (barra de tareas).`
    );
    await setWindowMinimized(page, false);
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      await sleep(2000);
      finalUrl = await readPageUrl(page);
      if (!isMercadoLibreBlockedUrl(finalUrl)) {
        console.log(`[ML] ✅ Challenge OK → ${finalUrl}`);
        await setWindowMinimized(page, true);
        return finalUrl;
      }
      // soft click continuar si existe
      try {
        await page.evaluate(() => {
          const buttons = [
            ...document.querySelectorAll("button, a, input[type=submit]"),
          ];
          const btn = buttons.find((b) =>
            /continuar|verificar|soy humano|entendido/i.test(
              (b.textContent || b.value || "").trim()
            )
          );
          btn?.click();
        });
      } catch {
        // ignore
      }
    }
    await setWindowMinimized(page, true);
  }

  try {
    const go = new URL(finalUrl).searchParams.get("go");
    if (go) {
      const target = decodeURIComponent(go);
      console.log(`[ML] ↪️ Retry go=: ${target}`);
      await safeGoto(page, target, {
        waitUntil: "domcontentloaded",
        timeout: Math.min(navTimeoutMs, 40000),
      });
      finalUrl = await readPageUrl(page);
    }
  } catch (err) {
    console.log(`[ML] ⚠️ go= falló: ${err.message}`);
  }

  if (isMercadoLibreBlockedUrl(finalUrl)) {
    throw new Error(`ML bloqueó la visita (verification/captcha): ${finalUrl}`);
  }

  return finalUrl;
}

/** Sesión ML persistente (mismo perfil + misma ventana minimizada). */
const mlSession = {
  browser: null,
  page: null,
  blockedUntil: 0,
  consecutiveBlocks: 0,
};

async function closeMlSession() {
  if (mlSession.browser) {
    try {
      await mlSession.browser.close();
    } catch {
      // ignore
    }
  }
  mlSession.browser = null;
  mlSession.page = null;
}

async function getMercadoLibrePage(platform) {
  if (mlSession.browser && mlSession.page) {
    try {
      await mlSession.page.evaluate(() => true);
      return mlSession.page;
    } catch {
      await closeMlSession();
    }
  }

  const executablePath = resolveBrowserExecutablePath({ preferChrome: true });
  if (executablePath) {
    console.log(`[ML] 🧭 Browser: ${executablePath}`);
  }
  console.log(`[ML] 👁️ Modo: ventana real minimizada (sesión caliente)`);

  const userDataDir = profileDirFor("mercadolibre");
  console.log(`[ML] 📁 Profile: ${userDataDir}`);

  const browser = await puppeteer.launch({
    headless: false,
    protocolTimeout: 120000,
    executablePath,
    userDataDir,
    ignoreDefaultArgs: ["--enable-automation"],
    defaultViewport: { width: 1366, height: 768, deviceScaleFactor: 1 },
    args: [
      ...LAUNCH_ARGS,
      "--start-minimized",
      "--window-position=-2400,-2400",
      "--window-size=1366,768",
    ],
  });

  await sleep(500);
  const page = await browser.newPage();
  await softenAutomation(page);
  await page.setExtraHTTPHeaders({
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  });
  await page.setUserAgent(resolveUserAgent(executablePath));
  page.setDefaultNavigationTimeout(platform.navTimeoutMs);

  await setWindowMinimized(page, true);

  mlSession.browser = browser;
  mlSession.page = page;
  return page;
}

/**
 * Loop infinito de visitas para UNA plataforma (ML o FB).
 * ML: browser real minimizado + perfil persistente (sesión caliente).
 * FB: headless como siempre.
 */
export function createVisitBot(platform) {
  let currentIndex = 0;
  let visitCounter = 0;

  async function visitMercadoLibre(io, url, productName) {
    const tag = `[ML]`;

    if (Date.now() < mlSession.blockedUntil) {
      const waitSec = Math.ceil((mlSession.blockedUntil - Date.now()) / 1000);
      console.log(`${tag} ⏸️ Cooldown verification (${waitSec}s) — salteo ${productName}`);
      return;
    }

    try {
      console.log(`${tag} 🌐 Abriendo: ${productName}`);
      console.log(`${tag} 🔗 ${url}`);

      const page = await getMercadoLibrePage(platform);
      await setWindowMinimized(page, true);

      const nav = await openMercadoLibreListing(page, url, platform.navTimeoutMs);
      const status = nav.status;
      console.log(`${tag} 📍 Landed: ${nav.finalUrl} (HTTP ${status})`);

      await dismissCookieBanner(page, "mercadolibre");

      const finalUrl = await ensureMercadoLibreProduct(
        page,
        url,
        platform.navTimeoutMs,
        { headed: true }
      );
      console.log(`${tag} 🛒 Producto: ${finalUrl}`);
      await simulateHumanBrowse(page);
      await sleep(platform.stayOnPageMs);

      mlSession.consecutiveBlocks = 0;

      logStatus(currentIndex + 1, "abierta", `ML:${productName}`);
      await emitStatus(io, currentIndex + 1, "ok", productName, url, null, platform.id);
      console.log(`${tag} ✅ OK - Status: ${status} - ${productName}`);
    } catch (error) {
      if (/verification|captcha|bloqueo/i.test(error.message || "")) {
        mlSession.consecutiveBlocks += 1;
        const cool =
          (platform.blockCooldownMs || 120000) *
          Math.min(mlSession.consecutiveBlocks, 4);
        mlSession.blockedUntil = Date.now() + cool;
        console.log(
          `${tag} 🧊 Block #${mlSession.consecutiveBlocks} → cooldown ${Math.round(cool / 1000)}s`
        );
        console.log(
          `${tag} 💡 Tip: en el próximo intento, si restaura la ventana, pasá el challenge una vez (no borramos el perfil).`
        );
      }

      console.error(`${tag} ❌ Fail ${productName}:`, error.message);
      logStatus(currentIndex + 1, "fallida", `ML:${productName}`, error);
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
      // No cerramos el browser ML — mantiene cookies / sesión caliente
      console.log(`${tag} ----------------------------------------------------------------`);
    }
  }

  async function visitFacebook(io, url, productName) {
    let browser;
    const tag = `[FB]`;

    try {
      console.log(`${tag} 🌐 Abriendo: ${productName}`);
      console.log(`${tag} 🔗 ${url}`);

      const executablePath = resolveBrowserExecutablePath();
      if (executablePath) {
        console.log(`${tag} 🧭 Browser: ${executablePath}`);
      }

      browser = await puppeteer.launch({
        headless: resolveHeadless("facebook"),
        protocolTimeout: 90000,
        args: LAUNCH_ARGS,
        executablePath,
        ignoreDefaultArgs: ["--enable-automation"],
        defaultViewport: {
          width: 1366,
          height: 768,
          deviceScaleFactor: 1,
        },
      });

      await sleep(300);
      const page = await browser.newPage();
      await softenAutomation(page);
      await page.setExtraHTTPHeaders({
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      });
      await page.setUserAgent(resolveUserAgent(executablePath));
      page.setDefaultNavigationTimeout(platform.navTimeoutMs);

      const nav = await openFacebookListing(page, url, platform.navTimeoutMs);
      const status = nav.status;
      console.log(`${tag} 📍 Landed: ${nav.finalUrl} (HTTP ${status})`);

      await dismissCookieBanner(page, "facebook");
      const check = await assertFacebookListingLoaded(page, productName);
      console.log(
        `${tag} 📄 Listing OK · price=${check.hasPrice} msg=${check.hasMessage} mkt=${Boolean(check.hasMarketplaceTitle)} · ${page.url()}`
      );
      await interactFacebookListing(page);
      await sleep(platform.stayOnPageMs);

      logStatus(currentIndex + 1, "abierta", `FB:${productName}`);
      await emitStatus(io, currentIndex + 1, "ok", productName, url, null, platform.id);
      console.log(`${tag} ✅ OK - Status: ${status} - ${productName}`);
    } catch (error) {
      console.error(`${tag} ❌ Fail ${productName}:`, error.message);
      logStatus(currentIndex + 1, "fallida", `FB:${productName}`, error);
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

  async function visitUrl(io, url, productName) {
    return withBrowserLock(async () => {
      if (platform.id === "mercadolibre") {
        await visitMercadoLibre(io, url, productName);
      } else {
        await visitFacebook(io, url, productName);
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
      console.log(
        `[ML] 💡 Sesión caliente: Chrome minimizado + perfil persistente. Si sale challenge, mirá la barra de tareas ~60s.`
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

  return { run, platform, closeMlSession };
}
