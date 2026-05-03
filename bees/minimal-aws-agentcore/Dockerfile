FROM --platform=linux/arm64 node:24-slim

WORKDIR /app

COPY package.json ./
COPY src ./src

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
