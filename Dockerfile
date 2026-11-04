FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS python-deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PATH="/opt/venv/bin:${PATH}"
ENV DRH_PYTHON_BIN=python3
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 poppler-utils tesseract-ocr tesseract-ocr-ind \
  && rm -rf /var/lib/apt/lists/*
COPY --from=python-deps /opt/venv /opt/venv
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts/parse_drh_pdf.py ./scripts/parse_drh_pdf.py
COPY --from=builder --chown=node:node /app/templates ./templates
RUN mkdir -p storage .next/cache/images \
  && chown -R node:node storage .next/cache
USER node

EXPOSE 3000
CMD ["node", "server.js"]
