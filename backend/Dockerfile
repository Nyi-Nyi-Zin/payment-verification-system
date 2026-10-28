FROM node:24-alpine AS frontend
WORKDIR /workspace/frontend
ENV NEXT_TELEMETRY_DISABLED=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./
RUN npm run build

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY backend/prisma ./prisma
COPY backend/tsconfig.json backend/tsconfig.build.json backend/nest-cli.json ./
COPY backend/src ./src
COPY backend/scripts/setup-ocr.cjs ./scripts/setup-ocr.cjs
RUN node scripts/setup-ocr.cjs
RUN pnpm prisma:generate && pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app && corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
# Prisma's CLI is included for migrate deploy; no compiler is needed at runtime.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/data/tessdata ./ocr-models
ENV OCR_DRIVER=tesseract TESSERACT_DATA_DIR=/app/ocr-models
COPY --from=frontend /workspace/backend/frontend-dist ./frontend-dist
COPY backend/scripts ./scripts
RUN mkdir -p /app/data/objects && chown -R app:app /app/data
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
