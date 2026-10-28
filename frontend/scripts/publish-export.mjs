import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  rename,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "frontend/out");
const destination = path.join(root, "backend/frontend-dist");
const staging = path.join(root, "backend/frontend-dist-staging");
const previous = path.join(root, "backend/frontend-dist-previous");
for (const target of [destination, staging, previous]) {
  const relative = path.relative(
    path.resolve(root, "backend"),
    path.resolve(target),
  );
  if (
    path.isAbsolute(relative) ||
    relative.startsWith("..") ||
    !/^frontend-dist(?:-staging|-previous)?$/.test(relative)
  )
    throw new Error("Unsafe generated output path");
}
const hashes = new Set();
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (file.endsWith(".html")) {
      const html = await readFile(file, "utf8");
      for (const match of html.matchAll(
        /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
      )) {
        if (!/\bsrc\s*=/i.test(match[1]) && match[2])
          hashes.add(
            `'sha256-${createHash("sha256").update(match[2]).digest("base64")}'`,
          );
      }
    }
  }
}
await scan(output);
if (!hashes.size)
  throw new Error(
    "Export contains no hydration scripts; inspect the build before publishing.",
  );
// Only these fixed generated directories may be replaced; source assets are never deleted.
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(output, staging, { recursive: true });
await writeFile(
  path.join(staging, "csp-hashes.json"),
  JSON.stringify([...hashes]),
);
await rm(previous, { recursive: true, force: true });
try {
  await rename(destination, previous);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
try {
  await rename(staging, destination);
} catch (error) {
  try {
    await rename(previous, destination);
  } catch {}
  throw error;
}
await rm(previous, { recursive: true, force: true });
console.log(`Published Next.js export with ${hashes.size} CSP script hashes.`);
