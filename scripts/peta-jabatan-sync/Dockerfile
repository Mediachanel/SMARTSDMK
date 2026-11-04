FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /tool
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY export-system.mjs sheets-layout.mjs capture-matrix.mjs ./
ENTRYPOINT ["node", "export-system.mjs"]
