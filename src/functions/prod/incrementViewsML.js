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
  if (currentIndex >= urlsML.length) {
    currentIndex = 0;
    visitCounter++;
    console.log(`Reiniciando. Visita número: ${visitCounter}`);
  }

  const url = urlsML[currentIndex];

  const executablePath = process.env.CHROME_BIN || '/usr/bin/chromium' || '/usr/bin/google-chrome';


  console.log(`Usando ejecutable de Chrome en: ${executablePath}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1920,1080",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(getRandomUserAgent());

  try {
    await page.goto(url, { timeout: 0 });
    logStatus(currentIndex + 1, "abierta", await getNameFromUrlML(url));

    // Notificar al cliente sobre el estado "ok"
    await emitStatus(io, currentIndex + 1, "ok", await getNameFromUrlML(url), url);
  } catch (error) {
    logStatus(currentIndex + 1, "fallida", await getNameFromUrlML(url), error);

    // Notificar al cliente sobre el estado "fail"
    await emitStatus(io, currentIndex + 1, "fail", await getNameFromUrlML(url), url);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await browser.close();
    logStatus(currentIndex + 1, "cerrada", await getNameFromUrlML(url));
    console.log(
      "----------------------------------------------------------------"
    );
    currentIndex++;
    setTimeout(() => incrementViewsML(io), 2000); // Llamada recursiva con retardo
  }
};
