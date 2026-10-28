const { readFile, writeFile, mkdir, rename, rm } = require("node:fs/promises");
const { createHash, randomUUID } = require("node:crypto");
const { resolve, join } = require("node:path");
require("dotenv").config({ path: resolve(__dirname, "../.env"), quiet: true });

const revision = "e12c65a915945e4c28e237a9b52bc4a8f39a0cec";
const models = {
  eng: "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba",
  mya: "629dc3ab7adf4321f329d99f8c737d920308df7519734e36277b773c24df0699",
};
const directory = resolve(
  __dirname,
  "..",
  process.env.TESSERACT_DATA_DIR || "./data/tessdata",
);
const digest = (data) => createHash("sha256").update(data).digest("hex");

async function main() {
  await mkdir(directory, { recursive: true });
  for (const [language, expected] of Object.entries(models)) {
    const target = join(directory, `${language}.traineddata`);
    try {
      if (digest(await readFile(target)) === expected) {
        console.log(`${language}: local best model verified`);
        continue;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    console.log(`${language}: downloading public Tesseract best model`);
    const response = await fetch(
      `https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/${revision}/${language}.traineddata`,
      { signal: AbortSignal.timeout(60000) },
    );
    if (!response.ok)
      throw new Error(`Model download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== expected)
      throw new Error(`${language}: model integrity check failed`);
    const temporary = `${target}.${randomUUID()}.download`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    console.log(`${language}: local best model installed and verified`);
  }
  console.log(
    "Local OCR is ready. Receipt recognition uses local models and does not require a cloud API or billing account.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
