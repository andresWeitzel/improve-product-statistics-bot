import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io";
import { incrementViewsML } from "./functions/prod/incrementViewsML.js";

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static("public"));

// Función que ejecuta incrementViewsML en un bucle continuo con manejo de errores
const runIncrementViewsML = async () => {
  try {
    await incrementViewsML(io);
  } catch (error) {
    console.error("Error en incrementViewsML:", error.message);

    // Espera 3 segundos antes de reintentar
    await new Promise((resolve) => setTimeout(resolve, 3000));
    runIncrementViewsML(); // Reiniciar el ciclo
  }
};

// Función asíncrona para iniciar el servidor
const startServer = async () => {
  try {
    // Iniciar el servidor en el puerto especificado por Render o en 9008
    const PORT = process.env.PORT || 9008;
    server.listen(PORT, () => {
      console.log(`Servidor web en puerto ${PORT}`);
    });

    // Iniciar el proceso de visitas en un bucle
    runIncrementViewsML();
  } catch (error) {
    console.error("Error al iniciar el servidor:", error);
  }
};

// Llamar a la función para iniciar el servidor
await startServer();
