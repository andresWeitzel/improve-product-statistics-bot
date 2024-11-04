import puppeteer from "puppeteer";
import { urlsML } from "../../const/web.js";
import {
  getNameFromUrlML,
  getRandomUserAgent,
} from "../../utils/conversions.js";
import { logStatus } from "../../utils/logging.js";
import { emitStatus } from "../../utils/socket.js";

let currentIndex = 0;
let visitCounter = 0;

// Tiempo máximo permitido para cada ciclo de visita en ms
const CYCLE_TIMEOUT = 20000;

async function incrementViewsML(io) {
  if (currentIndex >= urlsML.length) {
    currentIndex = 0;
    visitCounter++;
    console.log(`Reiniciando. Visita número: ${visitCounter}`);
  }

  const url = urlsML[currentIndex];
  const nameProduct = await getNameFromUrlML(url);

  let browser;
  let timeoutHandle;

  try {
    // Inicia un watchdog de tiempo para el ciclo completo
    const cyclePromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error("Ciclo excedió el tiempo límite de 20 segundos"));
      }, CYCLE_TIMEOUT);
    });

    // Ejecuta el ciclo de apertura del navegador, carga y cierre de página
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
      ],
    });
    const page = await browser.newPage();

    // Desactiva imágenes para ahorrar ancho de banda
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (["image", "stylesheet", "font"].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.setUserAgent(getRandomUserAgent());

    // Watchdog (cyclePromise): Usa Promise.race con un timeout de 20 segundos para todo el ciclo. Si el ciclo completo toma más tiempo, se cancela automáticamente.
    await Promise.race([page.goto(url, { timeout: 0 }), cyclePromise]);

    logStatus(currentIndex + 1, "abierta", nameProduct);

    // Notificar al cliente sobre el estado "ok"
    await emitStatus(io, currentIndex + 1, "ok", nameProduct, url);

  } catch (error) {
    logStatus(currentIndex + 1, "fallida", nameProduct, error.message);

    // Notificar al cliente sobre el estado "fail"
    emitStatus(io, currentIndex + 1, "fail", nameProduct, url);

    console.log("Error detectado. Reiniciando ciclo...");
  } finally {
    clearTimeout(timeoutHandle); // Cancela el watchdog si el ciclo se completa
    if (browser) await browser.close();

    logStatus(currentIndex + 1, "cerrada", nameProduct);

    console.log("----------------------------------------------------------------");

    currentIndex++;
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Espera de 1 segundo antes de reiniciar el ciclo
    await incrementViewsML(io); // Llamada recursiva para continuar el proceso
  }
}

// Exportar la función usando sintaxis de módulos ES
export { incrementViewsML };
