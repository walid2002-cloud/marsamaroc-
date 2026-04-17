FROM node:18

WORKDIR /app

# Chromium + all runtime libs required by Puppeteer in headless mode
RUN apt-get update && apt-get install -y --no-install-recommends \
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
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    procps \
    chromium \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Tell Puppeteer to use the system-installed Chromium instead of downloading its own
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV WWEBJS_AUTH_PATH=/app/.wwebjs_auth

RUN mkdir -p /app/.wwebjs_auth /app/uploads/bot-sources \
  && chmod -R 777 /app/.wwebjs_auth

EXPOSE 3000

CMD ["node", "server.js"]
