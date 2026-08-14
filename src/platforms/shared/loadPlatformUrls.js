import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

/**
 * Carga mapa producto → URL desde JSON en la raíz del repo.
 *
 * Convención (junto a .env.example):
 *   facebook.urls.json     ← el que editás
 *   facebook.urls.example.json
 *   mercadolibre.urls.json
 *   mercadolibre.urls.example.json
 *
 * Si falta el .urls.json, usa el .example.json.
 *
 * @param {"facebook"|"mercadolibre"} platform
 * @returns {Record<string, string>}
 */
export function loadPlatformUrls(platform) {
  const base = platform === "mercadolibre" ? "mercadolibre" : "facebook";
  const primary = path.join(ROOT, `${base}.urls.json`);
  const fallback = path.join(ROOT, `${base}.urls.example.json`);

  const file = fs.existsSync(primary)
    ? primary
    : fs.existsSync(fallback)
      ? fallback
      : null;

  if (!file) {
    console.warn(
      `⚠️ Sin URLs para ${base}: creá ${base}.urls.json (copiá desde ${base}.urls.example.json)`
    );
    return {};
  }

  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("el JSON debe ser un objeto { \"Producto\": \"https://...\" }");
    }

    const urls = {};
    for (const [name, url] of Object.entries(raw)) {
      const n = String(name ?? "").trim();
      const u = String(url ?? "").trim();
      if (n && u) urls[n] = u;
    }

    const label = path.basename(file);
    console.log(`🔗 ${base}: ${Object.keys(urls).length} URL(s) desde ${label}`);
    return urls;
  } catch (err) {
    console.error(`⚠️ No se pudo leer ${file}:`, err.message);
    return {};
  }
}
