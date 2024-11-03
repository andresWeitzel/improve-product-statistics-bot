import express from "express";
import http from "http";
import { Server as SocketIO } from "socket.io"; // Cambia a la importación de Socket.IO
import { incrementViewsML } from "./functions/prod/incrementViewsML.js"; // Asegúrate de que la ruta sea correcta

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server); // Instanciar el servidor de Socket.IO

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static("public"));

// Función asíncrona para iniciar el servidor y manejar la lógica
const startServer = async () => {
    try {
        // Iniciar la función de visitas y pasar el objeto io
        await incrementViewsML(io);
        
        // Iniciar el servidor en el puerto especificado por Render
        const PORT = process.env.PORT || 9008; // 9008 es el puerto local por defecto
        server.listen(PORT, () => {
            console.log(`Servidor web en puerto ${PORT}`);
        });
    } catch (error) {
        console.error(error);
    }
};

// Llamar a la función para iniciar el servidor
await startServer();
