/**
 * Compat local: el server usa src/platforms (ML + FB).
 * Este wrapper queda por si algún script viejo lo importa.
 */
import { platforms, createVisitBot } from "../../platforms/index.js";

export { createVisitBot };

export async function incrementViewsML(io) {
  await createVisitBot(platforms.mercadolibre).run(io);
}

export async function incrementViewsFB(io) {
  await createVisitBot(platforms.facebook).run(io);
}
