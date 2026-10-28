import { ValidationPipe, VersioningType } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

export function configureApp(app: NestExpressApplication): void {
  if (process.env.TRUST_PROXY)
    app.set(
      "trust proxy",
      process.env.TRUST_PROXY.split(",").map((value) => value.trim()),
    );
  const frontendRoot = join(__dirname, "../frontend-dist");
  const hashFile = join(frontendRoot, "csp-hashes.json");
  if (existsSync(join(frontendRoot, "index.html")) && !existsSync(hashFile)) {
    throw new Error(
      "Frontend CSP manifest is missing. Rebuild the frontend before starting NestJS.",
    );
  }
  const scriptHashes: string[] = existsSync(hashFile)
    ? JSON.parse(readFileSync(hashFile, "utf8"))
    : [];
  if (
    scriptHashes.some((hash) => !/^'sha256-[A-Za-z0-9+/]{43}='$/.test(hash))
  ) {
    throw new Error("Invalid frontend CSP manifest. Rebuild the frontend.");
  }
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.use(
    (
      request: unknown,
      response: { setHeader: (name: string, value: string) => void },
      next: () => void,
    ) => {
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "same-origin");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self' ${scriptHashes.join(" ")}; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
      );
      next();
    },
  );
  app.useStaticAssets(frontendRoot);
  app.enableShutdownHooks();
}
