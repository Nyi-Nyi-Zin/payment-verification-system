import { createRequire } from "node:module";

// Tesseract.js 7's relaxed-SIMD core aborts with tessdata_best float models.
// Keep ordinary SIMD detection while disabling only the broken relaxed variant
// inside this isolated OCR worker. Remove when upstream fixes:
// https://github.com/naptha/tesseract.js/issues/1080
const originalWorker =
  require.resolve("tesseract.js/src/worker-script/node/index.js");
const workerRequire = createRequire(originalWorker);
const detectionPath = workerRequire.resolve("wasm-feature-detect");
const detection = workerRequire(detectionPath);
const detectionModule = require.cache[detectionPath];
if (!detectionModule) throw new Error("OCR feature detection is unavailable");
detectionModule.exports = { ...detection, relaxedSimd: async () => false };
workerRequire(originalWorker);
