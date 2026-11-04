# ---- Stage 1: build the React website -------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY shared ./shared
RUN npm run build

# ---- Stage 2: the app (API + built website) in one small image --------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY backend ./backend
COPY shared ./shared
COPY --from=build /app/dist ./dist
EXPOSE 5000
CMD ["node", "backend/server.js"]
