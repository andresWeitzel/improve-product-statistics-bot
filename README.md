# Improve Product Statistics Bot

Bot Puppeteer para visitas a listings (Facebook Marketplace; MercadoLibre preparado pero deshabilitado). Monitor web en el puerto **9008**. Notificaciones: reporte diario por Gmail.

## Desarrollo local

```bash
npm install
npm run dev
```

UI: http://localhost:9008

## Docker (recomendado en Windows)

### Orden

```text
1) Arrancar Docker Desktop  →  Engine running
2) Carga inicial            →  scripts\Start-Bot-Docker.bat (o .ps1 / npm run docker:up)
3) Día a día                →  Start / Stop del contenedor en Docker Desktop
```

Al re-ejecutar el script: rebuild de imagen + recreate del contenedor.

| Cambio | Qué correr |
|--------|------------|
| Código / Dockerfile | `.bat` completo otra vez |
| Solo Start/Stop | Docker Desktop |
| Estado atascado | `.\scripts\Start-Bot-Docker.ps1 -Clean` y luego el `.bat` |

### Flags

| Flag | Efecto |
|------|--------|
| (none) | Build + `up -d` |
| `-SkipStart` | Solo build |
| `-Clean` | `compose down` antes |

## Notificaciones

| Qué | Canal |
|-----|--------|
| Reporte diario 21:00 AR | **Gmail** + **WhatsApp** (CallMeBot) |
| Fallo de visita | **WhatsApp** solamente |

### Gmail

Copiá `.env.example` → `.env` (App Password).

```bash
npm run report:preview
npm run report:send
npm run report:send -- --yesterday
```

### WhatsApp (CallMeBot)

1. Agregá el número del bot ([guía](https://www.callmebot.com/blog/free-api-whatsapp-messages/)).
2. Mandá: `I allow callmebot to send me messages`
3. Poné `WHATSAPP_PHONE`, `WHATSAPP_APIKEY` y `WHATSAPP_ENABLED=true` en `.env`

```bash
npm run whatsapp:test
npm run report:fail:preview
npm run report:fail
```

El mensaje te llega en el **chat de CallMeBot**, no en “Mensaje a vos mismo”.

## Solución de problemas

| Síntoma | Qué hacer |
|---------|-----------|
| Engine not ready | Abrí Docker Desktop y esperá Engine running |
| Contenedor no arranca | `-Clean` y volver a correr el `.bat` |
| Puppeteer / Chromium | La imagen usa `/usr/bin/chromium` |
| Puerto 9008 ocupado | No corras `npm run dev` y Docker a la vez; liberá el puerto |

## Uso recomendado

1. Dev: `npm run dev`
2. Producción local 24/7: Docker Desktop + contenedor `unless-stopped`
3. Cloud gratis usable para Puppeteer 24/7: casi solo Oracle Always Free (pide tarjeta). Render free no alcanza bien para este bot.
