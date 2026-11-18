FROM node:22-alpine
WORKDIR /app
COPY package.json server.js default-site.json ./
COPY public ./public
ENV PORT=8080 DATA_DIR=/app/data TRUST_PROXY=1
VOLUME /app/data
EXPOSE 8080
CMD ["node", "server.js"]
