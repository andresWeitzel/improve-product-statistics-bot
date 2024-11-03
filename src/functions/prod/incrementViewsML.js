const puppeteer = require("puppeteer-core");
const { urlsML } = require("../../const/web");
const {
  getNameFromUrlML,
  getRandomUserAgent,
} = require("../../utils/conversions");
const { logStatus } = require("../../utils/logging");
const { emitStatus } = require("../../utils/socket");

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

  const executablePath =
    process.env.CHROME_BIN ||
    //"/opt/render/project/.cache/ms-playwright/chromium-*/chromium" ||
    "/opt/render/project/src/node_modules/puppeteer-core/lib/cjs/puppeteer/node/BrowserLauncher" ||
    "/usr/bin/chromium" ||
    "/usr/bin/google-chrome"; // Cambia esto si es necesario

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
    logStatus(currentIndex + 1, "abierta", nameProduct);

    // Notificar al cliente sobre el estado "ok"
    await emitStatus(io, currentIndex + 1, "ok", nameProduct, url);
  } catch (error) {
    logStatus(currentIndex + 1, "fallida", nameProduct, error);

    // Notificar al cliente sobre el estado "fail"
    await emitStatus(io, currentIndex + 1, "fail", nameProduct, url);
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

module.exports = { incrementViewsML };
