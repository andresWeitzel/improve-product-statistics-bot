// Importar la función updateDateTime usando ES Modules
import { updateDateTime } from "./dateTime.js";

async function emitStatus(io, id, status, product, url) {
  io.emit("update", {
    id,
    status,
    product,
    url,
    datetime: updateDateTime(),
  });
}

// Exportar la función usando sintaxis de módulos ES
export { emitStatus };
