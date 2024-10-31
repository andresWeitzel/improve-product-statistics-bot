const puppeteer = require("puppeteer");
const { urlsML, userAgents } = require('../const/web');
const {updateDateTime} = require('../utils/dateTime');

let currentIndex = 0;
let visitCounter = 0;


async function incrementViewsML(io) {
  async function openAndCloseWindow() {
    if (currentIndex >= urlsML.length) {
      currentIndex = 0;
      visitCounter++;
      console.log(`Reiniciando. Visita número: ${visitCounter}`);
    }

    const datetime= updateDateTime(); 

    const url = urlsML[currentIndex];
    const pathProduct = url.split(".ar/")[1];
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    // Cambiar aleatoriamente el User-Agent
    const randomUserAgent =
      userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(randomUserAgent);
    // console.log(`User-Agent utilizado: ${randomUserAgent}`);

    try {
      await page.goto(url, { timeout: 0 });
      console.log(
        `ID: ${currentIndex + 1} | STATUS : abierta | PRODUCTO : ${pathProduct} | DATETIME: ${datetime}`
      );

      // Enviar actualización al cliente con estado OK
      io.emit("update", {
        id: currentIndex + 1,
        status: "ok",
        product: pathProduct,
        datetime: datetime
      });
    } catch (error) {
      console.log(
        `ID: ${currentIndex + 1} | STATUS : fallida | PRODUCTO : ${pathProduct} | DATETIME: ${datetime}`
      );

      // Enviar actualización al cliente con estado fallido
      io.emit("update", {
        id: currentIndex + 1,
        status: "fail",
        product: pathProduct,
      });
    } finally {
      await browser.close();
      console.log(
        `ID: ${currentIndex + 1} | STATUS : cerrada | PRODUCTO : ${pathProduct} | DATETIME: ${datetime}`
      );
      console.log(
        "----------------------------------------------------------------"
      );
      currentIndex++;
      setTimeout(openAndCloseWindow, 2000); // Llamada recursiva con retardo
    }
  }

  openAndCloseWindow();
}

module.exports = { incrementViewsML };
