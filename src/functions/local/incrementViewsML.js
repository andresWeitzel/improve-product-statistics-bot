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

async function incrementViewsML(io) {
  if (currentIndex >= urlsML.length) {
    currentIndex = 0;
    visitCounter++;
    console.log(`Reiniciando. Visita número: ${visitCounter}`);
  }

  const url = urlsML[currentIndex];

  const nameProduct = await getNameFromUrlML(url);

  // El modo new en 'headless' es para que se abra el navegador en segundo plano
  const browser = await puppeteer.launch({
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

  try {
    await page.goto(url, { timeout: 0 });

    logStatus(currentIndex + 1, "abierta", nameProduct);

    // Notificar al cliente sobre el estado "ok"
    await emitStatus(io, currentIndex + 1, "ok", nameProduct, url);
  } catch (error) {
    logStatus(currentIndex + 1, "fallida", nameProduct, error);

    // Notificar al cliente sobre el estado "fail"
    emitStatus(io, currentIndex + 1, "fail", nameProduct, url);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await browser.close();

    logStatus(currentIndex + 1, "cerrada", nameProduct);

    console.log(
      "----------------------------------------------------------------"
    );
    currentIndex++;
    setTimeout(() => incrementViewsML(io), 2000); // Llamada recursiva con retardo
  }
}

// Exportar la función usando sintaxis de módulos ES
export { incrementViewsML };
