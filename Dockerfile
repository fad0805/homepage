FROM --platform=linux/amd64 node:23 AS builder

RUN apt update && \
    apt install -y python3 python3-pip make g++

WORKDIR /app

COPY web .
RUN npm install
RUN npm run build

WORKDIR /api
COPY api/requirements.txt .
RUN pip3 install --break-system-packages -r requirements.txt

FROM --platform=linux/amd64 node:23-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/app ./app
COPY --from=builder /app/components ./components
copy --from=builder /app/next.config.ts ./next.config.ts

COPY /api /api

EXPOSE 3000

CMD ["npm", "start"]
