import { recordVisit, getStats } from "../db/memoryDb.js";

/**
 * Persiste la visita y la emite al frontend.
 * @param {import("socket.io").Server} io
 * @param {number} _legacyId índice de producto (compat); el store asigna id único
 * @param {"ok"|"fail"} status
 * @param {string} product
 * @param {string} url
 * @param {string|null} [error]
 */
async function emitStatus(io, _legacyId, status, product, url, error = null) {
  const visit = recordVisit({ status, product, url, error });
  io.emit("update", visit);
  io.emit("stats", getStats());
}

export { emitStatus };
