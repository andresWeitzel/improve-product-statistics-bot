import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const ENV_KEYS = {
  facebook: "FACEBOOK_URLS_JSON",
  mercadolibre: "MERCADOLIBRE_URLS_JSON",
};

/**
 * Normaliza un objeto { "Producto": "https://..." } a mapa limpio.
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
function normalizeUrlMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error('el JSON debe ser un objeto { "Producto": "https://..." }');
  }

  const urls = {};
  for (const [name, url] of Object.entries(raw)) {
    const n = String(name ?? "").trim();
    const u = String(url ?? "").trim();
    if (n && u) urls[n] = u;
  }
  return urls;
}

/**
 * Intenta parsear JSON desde env (Render / .env).
 * Aceptá una línea o multilínea; comillas envolventes opcionales.
 * @param {string} envKey
 * @returns {Record<string, string>|null}
 */
function loadFromEnv(envKey) {
  const raw = process.env[envKey];
  if (raw == null) return null;

  let text = String(raw).trim();
  if (!text) return null;

  if (
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('"') && text.endsWith('"'))
  ) {
    text = text.slice(1, -1).trim();
  }

  try {
    const urls = normalizeUrlMap(JSON.parse(text));
    console.log(
      `🔗 ${envKey}: ${Object.keys(urls).length} URL(s) desde variable de entorno`
    );
    return urls;
  } catch (err) {
    console.error(`⚠️ No se pudo parsear ${envKey}:`, err.message);
    return null;
  }
}

/**
 * Carga mapa producto → URL.
 *
 * Prioridad (coexisten local Docker + Render):
 *   1) Env: FACEBOOK_URLS_JSON / MERCADOLIBRE_URLS_JSON  ← Render / .env
 *   2) Archivo: {platform}.urls.json                     ← local (gitignored)
 *   3) Plantilla: {platform}.urls.example.json
 *
 * @param {"facebook"|"mercadolibre"} platform
 * @returns {Record<string, string>}
 */
export function loadPlatformUrls(platform) {
  const base = platform === "mercadolibre" ? "mercadolibre" : "facebook";
  const envKey = ENV_KEYS[base];

  const fromEnv = loadFromEnv(envKey);
  if (fromEnv) return fromEnv;

  const primary = path.join(ROOT, `${base}.urls.json`);
  const fallback = path.join(ROOT, `${base}.urls.example.json`);

  const file = fs.existsSync(primary)
    ? primary
    : fs.existsSync(fallback)
      ? fallback
      : null;

  if (!file) {
    console.warn(
      `⚠️ Sin URLs para ${base}: definí ${envKey} (Render) o creá ${base}.urls.json`
    );
    return {};
  }

  try {
    const urls = normalizeUrlMap(
      JSON.parse(fs.readFileSync(file, "utf8"))
    );
    console.log(
      `🔗 ${base}: ${Object.keys(urls).length} URL(s) desde ${path.basename(file)}`
    );
    return urls;
  } catch (err) {
    console.error(`⚠️ No se pudo leer ${file}:`, err.message);
    return {};
  }
}
