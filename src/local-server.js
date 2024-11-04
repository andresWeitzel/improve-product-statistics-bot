import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io"; // Importa como Server para evitar conflictos
import { incrementViewsML } from "./functions/local/incrementViewsML.js";

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

app.use(express.static("public"));

// Función que reinicia incrementViewsML en un bucle continuo con detección de errores
const runIncrementViewsML = async () => {
  try {
    await incrementViewsML(io);
  } catch (error) {
    console.error("Error en incrementViewsML:", error.message);
    
    // Espera de 3 segundos antes de intentar nuevamente
    await new Promise((resolve) => setTimeout(resolve, 3000));
    runIncrementViewsML(); // Reinicia el ciclo
  }
};

// Función asíncrona para iniciar el servidor
const startServer = async () => {
  try {
    // Iniciar el servidor
    const PORT = 9008;
    server.listen(PORT, () => {
      console.log("Servidor web en http://localhost:9008");
    });

    // Iniciar el proceso de visitas en un bucle
    runIncrementViewsML();
  } catch (error) {
    console.error("Error al iniciar el servidor:", error);
  }
};

// Llamar a la función para iniciar el servidor
await startServer();
