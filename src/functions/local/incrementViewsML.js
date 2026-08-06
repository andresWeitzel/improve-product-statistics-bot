/**
 * Compat local: el server usa src/bots/visitRunner.js (ML + FB en paralelo).
 * Estos exports sirven si querés correr un bot aislado.
 */
import { platforms } from "../../const/platforms.js";
import { createVisitBot } from "../../bots/visitRunner.js";

export { createVisitBot };

export async function incrementViewsML(io) {
  await createVisitBot(platforms.mercadolibre).run(io);
}

export async function incrementViewsFB(io) {
  await createVisitBot(platforms.facebook).run(io);
}
