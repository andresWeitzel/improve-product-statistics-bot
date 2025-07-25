# Improve Product Statistics Bot

## Correr localmente

```bash
npm install
npm start
```

Esto levanta el servidor en http://localhost:9008 (o el puerto que definas en la variable de entorno PORT).

## Deploy en Render

1. Sube tu proyecto a un repositorio de GitHub.
2. Ve a https://render.com/ y crea una cuenta (puedes usar GitHub).
3. Haz clic en "New +" y selecciona "Web Service".
4. Conecta tu repositorio de GitHub y selecciónalo.
5. Configuración automática:
   - **Name**: `improve-product-statistics-bot` (o el nombre que prefieras)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Haz clic en "Create Web Service".
7. ¡Listo! Render instalará dependencias y correrá tu app.

Render usará automáticamente el puerto definido por la variable de entorno `PORT`.

### Variables de Entorno (Opcional)
Si necesitas variables de entorno adicionales, agrégalas en la sección "Environment Variables" del dashboard de Render.

--- 