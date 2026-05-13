FROM node:24-slim

WORKDIR /app

COPY package.json ./
COPY src ./src

ENV PORT=8787
EXPOSE 8787

CMD ["npm", "start"]
