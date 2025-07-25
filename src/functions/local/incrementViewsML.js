import puppeteer from "puppeteer";
import { urlsML } from "../../const/web.js";
import {
  getRandomUserAgent,
} from "../../utils/conversions.js";
import { logStatus } from "../../utils/logging.js";
import { emitStatus } from "../../utils/socket.js";

let currentIndex = 0;
let visitCounter = 0;
const BROWSER_FULL_FLOW_TIMEOUT = 2000; // Más rápido en local
const BROWSER_OPEN_TIMEOUT = 45000; // Más tiempo en local
const VISIT_TIMEOUT = 40000; // Más tiempo en local

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
    await visitUrl(io, url, productName);
    currentIndex++;

    // Tiempo de espera entre visitas (más rápido en local)
    await new Promise((resolve) =>
      setTimeout(resolve, BROWSER_FULL_FLOW_TIMEOUT)
    );
  }
}

async function visitUrl(io, url, productName) {
  let browser;

  // Promise que se resolverá cuando la visita haya terminado
  const visitPromise = new Promise(async (resolve, reject) => {
    try {
      console.log(`🌐 Abriendo navegador para: ${url}`);
      
      browser = await puppeteer.launch({
        headless: "new", // Usar el nuevo modo headless
        protocolTimeout: 60000, // Aumentar timeout del protocolo
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-extensions",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-features=TranslateUI",
          "--disable-ipc-flooding-protection",
          "--memory-pressure-off",
          "--max_old_space_size=512",
          "--disable-web-security",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--hide-scrollbars",
          "--mute-audio",
          "--no-default-browser-check",
          "--no-pings",
          "--disable-hang-monitor",
          "--disable-prompt-on-repost",
          "--disable-client-side-phishing-detection",
          "--disable-component-extensions-with-background-pages",
          "--disable-domain-reliability",
          "--disable-print-preview",
          "--disable-sync-preferences",
          "--disable-threaded-animation",
          "--disable-threaded-scrolling",
          "--disable-web-resources"
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });

      const page = await browser.newPage();

      // Configuración básica sin request interception
      await page.setCacheEnabled(false);
      await page.setUserAgent(getRandomUserAgent());
      await page.setViewport({ width: 1366, height: 768 });

      console.log(`🌐 Navegando a: ${url}`);
      
      // Establecer un timeout para la navegación
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: BROWSER_OPEN_TIMEOUT,
      });

      // Verificar si la respuesta es válida
      if (!response || !response.ok()) {
        throw new Error(`Error al cargar la URL: ${url}`);
      }

      // Simulación básica
      await page.waitForTimeout(2000);
      await page.evaluate(() => {
        window.scrollTo(0, Math.random() * 500);
      });
      await page.waitForTimeout(1000);

      logStatus(currentIndex + 1, "abierta", productName);
      await emitStatus(io, currentIndex + 1, "ok", productName, url);
      console.log(`✅ Visita exitosa - Status: ${response.status()}`);
      resolve();
    } catch (error) {
      console.error(`❌ Error visitando la URL ${url}:`, error);
      logStatus(currentIndex + 1, "fallida", productName, error);
      await emitStatus(io, currentIndex + 1, "fail", productName, url);
      reject(error);
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
  });

  // Timeout que rechaza la promesa si se queda colgada
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout al visitar la URL: ${url}`)), VISIT_TIMEOUT)
  );

  // Ejecutar ambas promesas y manejar el resultado
  await Promise.race([visitPromise, timeoutPromise]);
}

export { incrementViewsML };
