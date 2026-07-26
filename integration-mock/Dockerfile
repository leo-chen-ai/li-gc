FROM node:24-alpine

ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    PORT=3000 \
    MOCK_DATABASE_PATH=/data/integration-mock.sqlite

WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts

RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "src/server.js"]
