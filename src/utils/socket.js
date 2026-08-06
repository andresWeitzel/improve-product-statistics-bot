import { recordVisit, getStats } from "../db/memoryDb.js";

/**
 * Persiste la visita y la emite al frontend.
 * @param {import("socket.io").Server} io
 * @param {number} _legacyId
 * @param {"ok"|"fail"} status
 * @param {string} product
 * @param {string} url
 * @param {string|null} [error]
 * @param {string} [platform] mercadolibre | facebook
 */
async function emitStatus(
  io,
  _legacyId,
  status,
  product,
  url,
  error = null,
  platform = "mercadolibre"
) {
  const visit = recordVisit({ status, product, url, error, platform });
  io.emit("update", visit);
  io.emit("stats", getStats());
}

export { emitStatus };
