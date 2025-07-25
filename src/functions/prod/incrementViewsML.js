import fetch from "node-fetch";
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

  try {
    console.log(`🌐 Haciendo request a: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 30000
    });

    if (response.ok) {
      console.log(`✅ Request exitoso - Status: ${response.status}`);
      logStatus(currentIndex + 1, "abierta", productName);
      await emitStatus(io, currentIndex + 1, "ok", productName, url);
      console.log(`📡 Datos enviados al frontend`);
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
  } catch (error) {
    console.error(`❌ Error visitando ${productName}:`, error.message);
    logStatus(currentIndex + 1, "fallida", productName, error);
    await emitStatus(io, currentIndex + 1, "fail", productName, url);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    logStatus(currentIndex + 1, "cerrada", productName);
    console.log(`🔒 Request completado`);
    console.log("----------------------------------------------------------------");
    currentIndex++;
    setTimeout(() => incrementViewsML(io), 2000);
  }
};
