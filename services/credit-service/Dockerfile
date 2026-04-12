FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json tsconfig.json ./
RUN npm install

# Copy app source
COPY src ./src

# Build the TypeScript app
RUN npm run build

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8002/health || exit 1

CMD ["node", "dist/index.js"]
