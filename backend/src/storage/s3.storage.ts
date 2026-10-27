import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/** Objects are private. Only authenticated API endpoints return their bytes. */
@Injectable()
export class S3Storage {
  private readonly client?: S3Client;
  private readonly root: string;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.root = resolve(
      config.get<string>("STORAGE_LOCAL_DIR") ?? "./data/objects",
    );
    this.bucket =
      config.get<string>("R2_BUCKET_NAME") ||
      config.get<string>("S3_BUCKET") ||
      "";
    const driver = config.get<string>("STORAGE_DRIVER") ?? "local";
    if (!["local", "s3"].includes(driver))
      throw new Error("STORAGE_DRIVER must be local or s3");
    if (driver === "s3") {
      const accessKeyId = config.get<string>("S3_ACCESS_KEY_ID");
      const secretAccessKey = config.get<string>("S3_SECRET_ACCESS_KEY");
      if (!this.bucket || !accessKeyId || !secretAccessKey) {
        throw new Error(
          "S3 bucket and credentials are required for STORAGE_DRIVER=s3",
        );
      }
      this.client = new S3Client({
        endpoint: config.get<string>("S3_ENDPOINT") || undefined,
        region: config.get<string>("S3_REGION") || "auto",
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }) {
    const path = this.localPath(input.key);
    if (this.client) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          Metadata: input.metadata,
        }),
      );
    } else {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, input.body, { mode: 0o600 });
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const path = this.localPath(key);
    if (!this.client) return readFile(path);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body)
      throw new ServiceUnavailableException("Stored object is unavailable");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  private localPath(key: string): string {
    if (
      !key ||
      key.includes("\\") ||
      key.split("/").some((part) => part === ".." || part === ".")
    ) {
      throw new Error("Invalid storage key");
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep))
      throw new Error("Invalid storage key");
    return path;
  }
}
