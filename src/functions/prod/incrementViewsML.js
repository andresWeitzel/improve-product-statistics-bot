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
const BROWSER_FULL_FLOW_TIMEOUT = 3000; // Aumentado para plan gratuito
const BROWSER_OPEN_TIMEOUT = 25000; // Reducido para plan gratuito
const VISIT_TIMEOUT = 20000; // Reducido para plan gratuito
const PAUSE_BETWEEN_VISITS = 5000; // Pausa más larga entre visitas

export const incrementViewsML = async (io) => {
  console.log(`📊 Total de URLs: ${Object.keys(urlsML).length}`);
  
  if (currentIndex >= Object.keys(urlsML).length) {
    currentIndex = 0;
    visitCounter++;
    console.log(`🔄 Reiniciando. Visita número: ${visitCounter}`);
    
    // Pausa más larga al completar el ciclo (para plan gratuito)
    console.log(`⏸️ Pausa de 30 segundos al completar ciclo...`);
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }

  const productNames = Object.keys(urlsML);
  const productName = productNames[currentIndex];
  const url = urlsML[productName];
  
  console.log(`🎯 Visitando: ${productName}`);
  console.log(`🔗 URL: ${url}`);

  await visitUrl(io, url, productName);
  
  // Tiempo de espera entre visitas (aumentado para plan gratuito)
  console.log(`⏸️ Pausa de ${PAUSE_BETWEEN_VISITS/1000}s entre visitas...`);
  await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_VISITS));
  currentIndex++;
  setTimeout(() => incrementViewsML(io), 2000);
};

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
          "--max_old_space_size=256", // Reducido para plan gratuito
          "--disable-javascript", // Deshabilitar JS para ahorrar memoria
          "--disable-images",
          "--disable-css"
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });

      const page = await browser.newPage();

      // Configuraciones para optimizar memoria y velocidad
      await page.setCacheEnabled(false);
      await page.setRequestInterception(true);
      
      page.on("request", (request) => {
        // Bloquear más recursos para ahorrar memoria
        if (["image", "stylesheet", "font", "media", "script"].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });

      await page.setUserAgent(getRandomUserAgent());
      await page.setViewport({ width: 1024, height: 768 }); // Reducido

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

      // Simulación mínima para ahorrar tiempo
      await page.waitForTimeout(1000);
      
      console.log(`✅ Visita exitosa - Status: ${response.status()}`);
      logStatus(currentIndex + 1, "abierta", productName);
      await emitStatus(io, currentIndex + 1, "ok", productName, url);
      console.log(`📡 Datos enviados al frontend`);
      
      resolve();
    } catch (error) {
      console.error(`❌ Error visitando ${productName}:`, error.message);
      logStatus(currentIndex + 1, "fallida", productName, error);
      await emitStatus(io, currentIndex + 1, "fail", productName, url);
      reject(error);
    } finally {
      if (browser) {
        try {
          await browser.close();
          logStatus(currentIndex + 1, "cerrada", productName);
          console.log(`🔒 Navegador cerrado`);
          
          // Forzar garbage collection si está disponible
          if (global.gc) {
            global.gc();
            console.log(`🗑️ Garbage collection ejecutado`);
          }
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
