# 单容器：Node 后端 + 自带静态前端 + SQLite（挂卷持久化）
FROM node:24-alpine
WORKDIR /app

# 后端依赖（先装，利用缓存）
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# 后端源码
COPY server ./server

# 前端 → public（由后端的 @fastify/static 服务）
COPY index.html manifest.webmanifest sw.js icon.svg ./public/
COPY css ./public/css
COPY js ./public/js

ENV NODE_ENV=production \
    STATIC_DIR=/app/public \
    DB_FILE=/app/data/zfsi.db \
    DECK_FILE=/app/public/js/data.js \
    PORT=8787

EXPOSE 8787
WORKDIR /app/server
# 每次启动幂等 seed（内置题库 upsert），再起服务
CMD ["sh","-c","node --experimental-sqlite seed.js && node --experimental-sqlite server.js"]
