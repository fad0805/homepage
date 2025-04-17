FROM --platform=linux/amd64 node:23 AS builder

# Installation of dependencies
RUN apt update && \
    apt install -y make g++

WORKDIR /app

COPY . .
RUN npm install
RUN npm run build

# Set runner image
FROM --platform=linux/amd64 node:23-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
copy --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["npm", "start"]
