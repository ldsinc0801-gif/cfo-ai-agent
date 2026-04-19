FROM node:20-slim

# Puppeteer用のChromium依存パッケージ
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto-cjk \
    poppler-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# data/uploads ディレクトリを作成
RUN mkdir -p data uploads

EXPOSE 3000

CMD ["npx", "tsx", "src/web/server.ts"]
