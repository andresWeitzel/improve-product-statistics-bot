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
const BROWSER_FULL_FLOW_TIMEOUT = 1000;
const BROWSER_OPEN_TIMEOUT = 30000;
const VISIT_TIMEOUT = 60000; // Timeout de 60 segundos para visitar una URL

async function incrementViewsML(io) {
  while (true) {
    if (currentIndex >= urlsML.length) {
      currentIndex = 0;
      visitCounter++;
      console.log(`Reiniciando. Visita número: ${visitCounter}`);
    }

    const url = urlsML[currentIndex];
    await visitUrl(io, url);
    currentIndex++;

    // Tiempo de espera entre visitas
    await new Promise((resolve) =>
      setTimeout(resolve, BROWSER_FULL_FLOW_TIMEOUT)
    );
  }
}

async function visitUrl(io, url) {
  const nameProduct = await getNameFromUrlML(url);
  let browser;

  // Promise que se resolverá cuando la visita haya terminado
  const visitPromise = new Promise(async (resolve, reject) => {
    try {
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

      // Desactivar imágenes para ahorrar ancho de banda
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (["image", "stylesheet", "font"].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });

      await page.setUserAgent(getRandomUserAgent());

      // Establecer un timeout para la navegación (espera del navegador si falla)
      const response = await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: BROWSER_OPEN_TIMEOUT,
      });

      // Verificar si la respuesta es válida
      if (!response || !response.ok()) {
        throw new Error(`Error al cargar la URL: ${url}`);
      }

      logStatus(currentIndex + 1, "abierta", nameProduct);
      await emitStatus(io, currentIndex + 1, "ok", nameProduct, url);
      resolve(); // Resuelve la promesa si todo va bien
    } catch (error) {
      console.error(`Error visitando la URL ${url}:`, error);
      logStatus(currentIndex + 1, "fallida", nameProduct, error);
      await emitStatus(io, currentIndex + 1, "fail", nameProduct, url);
      reject(error); // Rechaza la promesa si ocurre un error
    } finally {
      if (browser) {
        await browser.close();
        logStatus(currentIndex + 1, "cerrada", nameProduct);
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

// Exportar la función usando sintaxis de módulos ES
export { incrementViewsML };
