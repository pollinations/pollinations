FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev=false

COPY . .

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

CMD ["npm", "run", "serve"]
