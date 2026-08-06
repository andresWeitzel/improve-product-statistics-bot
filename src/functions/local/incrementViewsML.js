import puppeteer from "puppeteer";
import { urlsML } from "../../const/web.js";
import { getRandomUserAgent } from "../../utils/conversions.js";
import { logStatus } from "../../utils/logging.js";
import { emitStatus } from "../../utils/socket.js";
import { resolveBrowserExecutablePath } from "../../utils/browserPath.js";

let currentIndex = 0;
let visitCounter = 0;
const PAUSE_BETWEEN_VISITS_MS = 2000;
const NAV_TIMEOUT_MS = 45000;
const STAY_ON_PAGE_MS = 2500;

/** Args estables en Windows (Edge/Chrome). Evitar --single-process / --no-zygote. */
const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--disable-extensions",
  "--mute-audio",
  "--no-default-browser-check",
];

async function incrementViewsML(io) {
  const productNames = Object.keys(urlsML);
  while (true) {
    if (currentIndex >= productNames.length) {
      currentIndex = 0;
      visitCounter++;
      console.log(`🔄 Reiniciando. Visita número: ${visitCounter}`);
    }

    const productName = productNames[currentIndex];
    const url = urlsML[productName];

    // Nunca tirar: un fallo no debe cortar el ciclo ni reintentar el mismo ítem en loop
    await visitUrl(io, url, productName);
    currentIndex++;

    await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_VISITS_MS));
  }
}

async function visitUrl(io, url, productName) {
  let browser;

  try {
    console.log(`🌐 Abriendo navegador para: ${url}`);

    const executablePath = resolveBrowserExecutablePath();
    if (executablePath) {
      console.log(`🧭 Browser: ${executablePath}`);
    }

    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 60000,
      args: LAUNCH_ARGS,
      executablePath,
      ignoreDefaultArgs: ["--enable-automation"],
    });

    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setUserAgent(getRandomUserAgent());
    await page.setViewport({ width: 1366, height: 768 });
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    console.log(`🌐 Navegando a: ${url}`);
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });

    if (!response) {
      throw new Error(`Sin respuesta al cargar: ${url}`);
    }

    // ML a veces responde 4xx/5xx; igual contamos carga si hubo response
    await new Promise((r) => setTimeout(r, STAY_ON_PAGE_MS));
    try {
      await page.evaluate(() => window.scrollTo(0, Math.random() * 500));
    } catch {
      // scroll opcional si el frame ya no está
    }

    logStatus(currentIndex + 1, "abierta", productName);
    await emitStatus(io, currentIndex + 1, "ok", productName, url);
    console.log(`✅ Visita exitosa - Status: ${response.status()}`);
  } catch (error) {
    console.error(`❌ Error visitando la URL ${url}:`, error.message);
    logStatus(currentIndex + 1, "fallida", productName, error);
    await emitStatus(io, currentIndex + 1, "fail", productName, url, error?.message);
  } finally {
    if (browser) {
      try {
        await browser.close();
        logStatus(currentIndex + 1, "cerrada", productName);
        console.log(`🔒 Navegador cerrado`);
      } catch (closeError) {
        console.log(`⚠️ Error al cerrar navegador:`, closeError.message);
      }
    }
    console.log("----------------------------------------------------------------");
  }
}

export { incrementViewsML };
