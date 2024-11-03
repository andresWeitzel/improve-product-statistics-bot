// Importar la función updateDateTime usando import en módulos ES
import { updateDateTime } from "./dateTime.js";

function logStatus(id, action, productName, error) {
  console.log(
    `ID: ${id} | STATUS: ${action.toUpperCase()} | ` +
      `PRODUCTO: ${productName} | DATETIME: ${updateDateTime()}`
  );
  if (error) {
    console.error(`Error: ${error.message}`);
  }
}

// Exportar la función usando sintaxis de módulos ES
export { logStatus };
