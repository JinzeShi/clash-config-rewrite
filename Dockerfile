FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache git && \
    git clone https://github.com/JinzeShi/clash-config-rewrite.git . && \
    rm -rf .git

RUN npm ci && npm run build && npm prune --production

EXPOSE 13000

CMD ["node", "dist/server.js"]
