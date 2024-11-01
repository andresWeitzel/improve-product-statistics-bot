const puppeteer = require("puppeteer");
const { urlsML } = require("../const/web");
const { updateDateTime } = require("../utils/dateTime");
const {
  getNameFromUrlML,
  getRandomUserAgent,
} = require("../utils/conversions");

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
    headless: "new",
    args: ["--window-size=1920,1080"],
  });
  const page = await browser.newPage();

  await page.setUserAgent(getRandomUserAgent());

  try {
    await page.goto(url, { timeout: 0 });
    console.log(
      `ID: ${
        currentIndex + 1
      } | STATUS : abierta | PRODUCTO : ${nameProduct} | DATETIME: ${updateDateTime()}`
    );

    // Enviar actualización al cliente con estado OK
    io.emit("update", {
      id: currentIndex + 1,
      status: "ok",
      product: nameProduct,
      url: url,
      datetime: updateDateTime(),
    });
  } catch (error) {
    console.log(
      `ID: ${
        currentIndex + 1
      } | STATUS : fallida | PRODUCTO : ${nameProduct} | DATETIME: ${updateDateTime()}`
    );

    // Enviar actualización al cliente con estado fallido
    io.emit("update", {
      id: currentIndex + 1,
      status: "fail",
      product: nameProduct,
      url: url,
      datetime: updateDateTime(),
    });
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await browser.close();
    console.log(
      `ID: ${
        currentIndex + 1
      } | STATUS : cerrada | PRODUCTO : ${nameProduct} | DATETIME: ${updateDateTime()}`
    );
    console.log(
      "----------------------------------------------------------------"
    );
    currentIndex++;
    setTimeout(() => incrementViewsML(io), 2000); // Llamada recursiva con retardo
  }
}

module.exports = { incrementViewsML };
