FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8080 DB_PATH=/app/data/resolveai.db
EXPOSE 8080
CMD ["npm", "run", "start", "-w", "server"]
