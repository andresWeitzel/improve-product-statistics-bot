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

export const incrementViewsML = async (io) => {
  console.log(`📊 Total de URLs: ${Object.keys(urlsML).length}`);
  
  if (currentIndex >= Object.keys(urlsML).length) {
    currentIndex = 0;
    visitCounter++;
    console.log(`🔄 Reiniciando. Visita número: ${visitCounter}`);
  }

  const productNames = Object.keys(urlsML);
  const productName = productNames[currentIndex];
  const url = urlsML[productName];
  
  console.log(`🎯 Visitando: ${productName}`);
  console.log(`🔗 URL: ${url}`);

  // Configuración optimizada para entornos cloud
  const browser = await puppeteer.launch({
    headless: true,
    product: 'chrome',
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--window-size=1920,1080",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(getRandomUserAgent());

  try {
    console.log(`🌐 Navegando a: ${url}`);
    await page.goto(url, { 
      timeout: 30000,
      waitUntil: 'domcontentloaded'
    });
    console.log(`✅ Página cargada exitosamente`);
    
    logStatus(currentIndex + 1, "abierta", productName);
    await emitStatus(io, currentIndex + 1, "ok", productName, url);
    console.log(`📡 Datos enviados al frontend`);
    
  } catch (error) {
    console.error(`❌ Error visitando ${productName}:`, error.message);
    logStatus(currentIndex + 1, "fallida", productName, error);
    await emitStatus(io, currentIndex + 1, "fail", productName, url);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await browser.close();
    logStatus(currentIndex + 1, "cerrada", productName);
    console.log(`🔒 Navegador cerrado`);
    console.log("----------------------------------------------------------------");
    currentIndex++;
    setTimeout(() => incrementViewsML(io), 2000);
  }
};
