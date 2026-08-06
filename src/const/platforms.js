/** User-agents actuales compartidos. */
export const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
];

/**
 * Dos bots independientes: MercadoLibre y Facebook.
 * Cada uno tiene sus URLs y tunning (pausas, permanencia, etc.).
 */
export const platforms = {
  mercadolibre: {
    id: "mercadolibre",
    label: "MercadoLibre",
    short: "ML",
    enabled: true,
    urls: {
      "Cama cucheta":
        "https://www.mercadolibre.com.ar/cama-cucheta-con-escritorio-mueble-organizador-y-placard/up/MLAU4595842089",
      "Multigimnasio Everlast":
        "https://www.mercadolibre.com.ar/multigimnasio-everlast-liquidacion/up/MLAU2889015601",
    },
    // Tunning ML (ajustable con el tiempo)
    // domcontentloaded: ML hace redirects; "load" falla mucho / response null
    pauseBetweenMs: 10000,
    pauseJitterMs: 4000,
    stayOnPageMs: 10000,
    navTimeoutMs: 60000,
    waitUntil: "domcontentloaded",
  },

  facebook: {
    id: "facebook",
    label: "Facebook",
    short: "FB",
    enabled: true,
    urls: {
      "Cama cucheta":
        "https://www.facebook.com/marketplace/item/1612217943579408/",
      "Multigym Everlast":
        "https://www.facebook.com/marketplace/item/1592343702491847/",
    },
    // Tunning FB (suele necesitar más paciencia / cookies)
    pauseBetweenMs: 10000,
    pauseJitterMs: 5000,
    stayOnPageMs: 15000,
    navTimeoutMs: 70000,
    waitUntil: "domcontentloaded",
  },
};

/** Compat: mapa plano ML (código viejo / prod). */
export const urlsML = Object.fromEntries(
  Object.entries(platforms.mercadolibre.urls).map(([k, v]) => [
    k,
    typeof v === "string" ? v : v.url,
  ])
);

/** Compat: mapa plano FB. */
export const urlsFB = Object.fromEntries(
  Object.entries(platforms.facebook.urls).map(([k, v]) => [
    k,
    typeof v === "string" ? v : v.url,
  ])
);
