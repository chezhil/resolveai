FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8080 DB_PATH=/app/data/resolveai.db
# Run as the unprivileged node user; /app/data holds the SQLite archive.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 8080
CMD ["npm", "run", "start", "-w", "server"]
