# Improve Product Statistics Bot

## Correr localmente

```bash
npm install
npm start
```

Esto levanta el servidor en http://localhost:9008 (o el puerto que definas en la variable de entorno PORT).

## Deploy en Railway

1. Sube tu proyecto a un repositorio de GitHub.
2. Ve a https://railway.app/ y crea una cuenta (puedes usar GitHub).
3. Crea un nuevo proyecto y elige "Deploy from GitHub repo".
4. Selecciona tu repositorio y Railway detectará automáticamente el script `start`.
5. ¡Listo! Railway instalará dependencias y correrá tu app.

Railway usará automáticamente el puerto definido por la variable de entorno `PORT`.

---

Si necesitas variables de entorno adicionales, agrégalas en el panel de Railway en la sección "Variables". 