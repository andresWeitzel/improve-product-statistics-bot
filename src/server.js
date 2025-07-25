import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io";

// Selección dinámica de la función según entorno
let incrementViewsML;
if (process.env.NODE_ENV === "production") {
  incrementViewsML = (await import("./functions/prod/incrementViewsML.js")).incrementViewsML;
} else {
  incrementViewsML = (await import("./functions/local/incrementViewsML.js")).incrementViewsML;
}

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

app.use(express.static("public"));

const runIncrementViewsML = async () => {
  try {
    await incrementViewsML(io);
  } catch (error) {
    console.error("Error en incrementViewsML:", error.message);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    runIncrementViewsML();
  }
};

const startServer = async () => {
  try {
    const PORT = process.env.PORT || 9008;
    server.listen(PORT, () => {
      console.log(`Servidor web en puerto ${PORT}`);
    });
    runIncrementViewsML();
  } catch (error) {
    console.error("Error al iniciar el servidor:", error);
  }
};

await startServer(); 