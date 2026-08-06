# Improve Product Statistics Bot 🚀

Bot para mejorar estadísticas de vistas en MercadoLibre usando Puppeteer.

## 🖥️ Desarrollo Local

```bash
npm install
npm run dev
```

Esto levanta el servidor en http://localhost:9008.

## 🐳 Docker (recomendado en Windows)

Mismo flujo que Atlas UX/UI Platform: Docker Desktop + script de carga inicial.

### Orden obligatorio

```text
1) Arrancar Docker Desktop  -->  esperar "Engine running"
2) Carga inicial            -->  Start-Bot-Docker (.bat / .ps1)
                                 = build imagen + up -d contenedor
3) Control diario           -->  Start / Stop del contenedor en Docker Desktop
```

### Carga inicial / subir cambios

**Opción A — doble clic:** `scripts\Start-Bot-Docker.bat`  
**Opción B:** `.\scripts\Start-Bot-Docker.ps1`  
**Opción C:** `npm run docker:up`

Crea / actualiza:

1. Imagen `improve-product-statistics-bot:local`
2. Contenedor `improve-product-statistics-bot` en **Running**
3. UI en http://localhost:9008

**No hace falta** borrar el contenedor a mano. Al re-ejecutar el `.bat`:

- Rebuild de la imagen (código nuevo)
- `up -d --force-recreate` recrea el contenedor con la imagen nueva

| Cambio | Qué correr |
|--------|------------|
| Código (`src/`, `public/`, Dockerfile, …) | `.bat` completo otra vez |
| Solo Start/Stop sin cambios | Docker Desktop → Start / Stop |
| Estado atascado | `.\scripts\Start-Bot-Docker.ps1 -Clean` luego el `.bat` |

### Flags del script

| Flag | Efecto |
|------|--------|
| (none) | Build + `up -d` |
| `-SkipStart` | Solo build (no arranca contenedor) |
| `-Clean` | `compose down` antes de build/start |

## 🚀 Deploy en Render

### Configuración Automática (Recomendado)

1. Sube tu proyecto a un repositorio de GitHub.
2. Ve a https://render.com/ y crea una cuenta (puedes usar GitHub).
3. Haz clic en "New +" y selecciona "Web Service".
4. Conecta tu repositorio de GitHub y selecciónalo.
5. Configuración automática:
   - **Name**: `improve-product-statistics-bot` (o el nombre que prefieras)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. **Variables de Entorno** (IMPORTANTE):
   - `NODE_ENV`: `production`
   - `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD`: `true`
   - `PUPPETEER_EXECUTABLE_PATH`: `/usr/bin/google-chrome-stable`
7. Haz clic en "Create Web Service".

### Configuración Manual

Si prefieres configurar manualmente, agrega estas variables de entorno en la sección "Environment Variables" del dashboard de Render:

```
NODE_ENV=production
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
```

## 📊 Diferencias entre Entornos

| Característica | Local (`npm run dev`) | Docker | Producción (Render) |
|----------------|----------------------|--------|---------------------|
| **Velocidad** | Rápida (2s entre visitas) | Producción (5s) | Lenta (5s entre visitas) |
| **Memoria** | Sin límites | Contenedor local | 512MB limitada |
| **Timeouts** | 45s | Prod | 25s |
| **Simulación** | Completa (scroll, JS) | Prod | Mínima (solo carga) |
| **Costo** | Gratis | Gratis (local) | Gratis (plan básico) |

## ⚠️ Notas Importantes para Render

- **Plan Gratuito**: Tiene límites de 30 segundos por request y 512MB de RAM
- **Puppeteer**: Está optimizado para usar Chrome pre-instalado en Render
- **Timeouts**: Reducidos para evitar problemas con el plan gratuito
- **Memoria**: Configurado para usar menos recursos

## 🔧 Solución de Problemas

### Docker

| Síntoma | Qué hacer |
|---------|-----------|
| Engine not ready | Abrí Docker Desktop y esperá **Engine running**, luego el `.bat` |
| Contenedor no arranca | `.\scripts\Start-Bot-Docker.ps1 -Clean` y volvé a correr el `.bat` |
| Puppeteer / Chromium | La imagen usa Chromium del sistema (`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`) |
| Puerto ocupado | Liberá el `9008` o cambiá el mapeo en `docker-compose.yml` |

### Render

Si tienes problemas con Puppeteer en Render:

1. **Error de memoria**: Reduce el número de pestañas simultáneas
2. **Timeout**: Aumenta los timeouts en el código si tienes plan pago
3. **Chrome no encontrado**: Verifica que `PUPPETEER_EXECUTABLE_PATH` esté configurado

## 🎯 Uso Recomendado

1. **Desarrollo**: Usa `npm run dev` para testing local
2. **Docker local**: Doble clic en `scripts\Start-Bot-Docker.bat` (con Desktop abierto)
3. **Producción cloud**: Usa Render con plan gratuito para pocos productos
4. **Escalado**: Considera plan pago de Render para más productos
