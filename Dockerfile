FROM node:22-alpine
WORKDIR /app
COPY package.json server.js default-site.json ./
COPY src ./src
COPY public ./public
ENV PORT=3002 DATA_DIR=/app/data TRUST_PROXY=1
VOLUME /app/data
EXPOSE 3002
CMD ["node", "server.js"]
