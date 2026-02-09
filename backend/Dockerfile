FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ bash git libc6-compat

COPY package.json package-lock.json* ./
RUN npm install --production

COPY . .

EXPOSE 4000

CMD ["node", "server.js"]
