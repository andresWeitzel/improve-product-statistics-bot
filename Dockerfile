# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim

WORKDIR /app

# Chromium + deps for Puppeteer (headless) inside the container
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=9008 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json package-lock.json* ./
# ignore-scripts: skip postinstall Chrome download; we use system Chromium
RUN npm install --omit=dev --ignore-scripts

COPY src ./src
COPY public ./public
# Plantillas públicas; las URLs reales se montan desde el host (gitignored)
COPY facebook.urls.example.json mercadolibre.urls.example.json ./

RUN mkdir -p /app/data

EXPOSE 9008

CMD ["npm", "start"]
