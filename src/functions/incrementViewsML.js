const puppeteer = require("puppeteer");
const { urlsML, userAgents } = require("../const/web");
const { updateDateTime } = require("../utils/dateTime");

let currentIndex = 0;
let visitCounter = 0;

async function incrementViewsML(io) {
  if (currentIndex >= urlsML.length) {
    currentIndex = 0;
    visitCounter++;
    console.log(`Reiniciando. Visita número: ${visitCounter}`);
  }

  const url = urlsML[currentIndex];
  const pathProduct = url.split(".ar/")[1];
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Cambiar aleatoriamente el User-Agent
  const randomUserAgent =
    userAgents[Math.floor(Math.random() * userAgents.length)];
  await page.setUserAgent(randomUserAgent);

  try {
    await page.goto(url, { timeout: 0 });
    console.log(
      `ID: ${currentIndex + 1} | STATUS : abierta | PRODUCTO : ${pathProduct} | DATETIME: ${updateDateTime()}`
    );

    // Enviar actualización al cliente con estado OK
    io.emit("update", {
      id: currentIndex + 1,
      status: "ok",
      product: pathProduct,
      datetime: updateDateTime(),
    });
  } catch (error) {
    console.log(
      `ID: ${currentIndex + 1} | STATUS : fallida | PRODUCTO : ${pathProduct} | DATETIME: ${updateDateTime()}`
    );

    // Enviar actualización al cliente con estado fallido
    io.emit("update", {
      id: currentIndex + 1,
      status: "fail",
      product: pathProduct,
    });
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await browser.close();
    console.log(
      `ID: ${currentIndex + 1} | STATUS : cerrada | PRODUCTO : ${pathProduct} | DATETIME: ${updateDateTime()}`
    );
    console.log("----------------------------------------------------------------");
    currentIndex++;
    setTimeout(() => incrementViewsML(io), 2000); // Llamada recursiva con retardo
  }
}

module.exports = { incrementViewsML };
