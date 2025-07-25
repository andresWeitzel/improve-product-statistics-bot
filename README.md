# Improve Product Statistics Bot 🚀

Bot para mejorar estadísticas de vistas en MercadoLibre usando Puppeteer.

## 🖥️ Desarrollo Local

```bash
npm install
npm run dev
```

Esto levanta el servidor en http://localhost:9008.

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

| Característica | Local | Producción (Render) |
|----------------|-------|---------------------|
| **Velocidad** | Rápida (2s entre visitas) | Lenta (5s entre visitas) |
| **Memoria** | Sin límites | 512MB limitada |
| **Timeouts** | 45s | 25s |
| **Simulación** | Completa (scroll, JS) | Mínima (solo carga) |
| **Costo** | Gratis | Gratis (plan básico) |

## ⚠️ Notas Importantes para Render

- **Plan Gratuito**: Tiene límites de 30 segundos por request y 512MB de RAM
- **Puppeteer**: Está optimizado para usar Chrome pre-instalado en Render
- **Timeouts**: Reducidos para evitar problemas con el plan gratuito
- **Memoria**: Configurado para usar menos recursos

## 🔧 Solución de Problemas

### Render
Si tienes problemas con Puppeteer en Render:

1. **Error de memoria**: Reduce el número de pestañas simultáneas
2. **Timeout**: Aumenta los timeouts en el código si tienes plan pago
3. **Chrome no encontrado**: Verifica que `PUPPETEER_EXECUTABLE_PATH` esté configurado

## 🎯 Uso Recomendado

1. **Desarrollo**: Usa `npm run dev` para testing local
2. **Producción**: Usa Render con plan gratuito para pocos productos
3. **Escalado**: Considera plan pago de Render para más productos

¡Listo! Ahora tienes una configuración optimizada para Render con Puppeteer funcionando correctamente. 