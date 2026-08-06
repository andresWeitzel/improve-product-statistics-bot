/**
 * Compat: re-export de la Memory DB.
 * Preferí importar desde `../db/memoryDb.js` en código nuevo.
 */
export {
  recordVisit,
  getHistory,
  getStats,
  getDbMeta,
  clearDb,
  memoryDb,
} from "../db/memoryDb.js";
