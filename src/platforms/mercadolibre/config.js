export const mercadolibreConfig = {
  id: "mercadolibre",
  label: "MercadoLibre",
  short: "ML",
  // Reactivar con enabled: true cuando haya proxy / baje el bloqueo anti-bot.
  enabled: false,
  urls: {
    "Cama cucheta":
      "https://www.mercadolibre.com.ar/cama-cucheta-con-escritorio-mueble-organizador-y-placard/up/MLAU4595842089",
    "Multigimnasio Everlast":
      "https://www.mercadolibre.com.ar/multigimnasio-everlast-liquidacion/up/MLAU2889015601",
  },
  mlStrategies: ["direct", "mobile", "home_then_product", "plain_bundle"],
  pauseBetweenMs: 15000,
  pauseJitterMs: 8000,
  stayOnPageMs: 8000,
  navTimeoutMs: 60000,
  waitUntil: "domcontentloaded",
  blockCooldownMs: 60000,
};
