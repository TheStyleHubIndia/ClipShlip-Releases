FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip && pip3 install --no-cache-dir --break-system-packages "yt-dlp[default]" && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/package.json ./
RUN npm install --omit=dev
COPY worker/server.js ./
RUN mkdir -p /app/tmp
EXPOSE 8787
CMD ["npm","start"]
