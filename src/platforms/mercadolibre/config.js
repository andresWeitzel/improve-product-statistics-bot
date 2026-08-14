import { loadPlatformUrls } from "../shared/loadPlatformUrls.js";

export const mercadolibreConfig = {
  id: "mercadolibre",
  label: "MercadoLibre",
  short: "ML",
  // Reactivar con enabled: true cuando haya proxy / baje el bloqueo anti-bot.
  enabled: false,
  // URLs: mercadolibre.urls.json (plantilla: mercadolibre.urls.example.json)
  urls: loadPlatformUrls("mercadolibre"),
  mlStrategies: ["direct", "mobile", "home_then_product", "plain_bundle"],
  pauseBetweenMs: 15000,
  pauseJitterMs: 8000,
  stayOnPageMs: 8000,
  navTimeoutMs: 60000,
  waitUntil: "domcontentloaded",
  blockCooldownMs: 60000,
};
