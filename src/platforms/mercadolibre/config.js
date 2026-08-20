import { loadPlatformUrls } from "../shared/loadPlatformUrls.js";

function envFlag(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(v).trim().toLowerCase());
}

export const mercadolibreConfig = {
  id: "mercadolibre",
  label: "MercadoLibre",
  short: "ML",
  // Local default off (anti-bot). En Render: MERCADOLIBRE_ENABLED=true
  enabled: envFlag("MERCADOLIBRE_ENABLED", false),
  // URLs: MERCADOLIBRE_URLS_JSON (Render) o mercadolibre.urls.json (local)
  urls: loadPlatformUrls("mercadolibre"),
  mlStrategies: ["direct", "mobile", "home_then_product", "plain_bundle"],
  pauseBetweenMs: 15000,
  pauseJitterMs: 8000,
  stayOnPageMs: 8000,
  navTimeoutMs: 60000,
  waitUntil: "domcontentloaded",
  blockCooldownMs: 60000,
};
