import { recordVisit, getStats } from "../db/memoryDb.js";
import { notifyVisitFailure } from "../notifications/whatsapp/failAlert.js";

/**
 * Persiste la visita y la emite al frontend.
 * Fallos → WhatsApp (CallMeBot), no Gmail.
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

  if (status === "fail") {
    void notifyVisitFailure(visit);
  }
}

export { emitStatus };
