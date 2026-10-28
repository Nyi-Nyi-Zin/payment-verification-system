import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../database.prisma";
import { digest } from "./session.helpers";

@Injectable()
export class LoginThrottle {
  constructor(private readonly prisma: PrismaService) {}
  private bucket(
    address: string,
    type: "login" | "refresh" | "register" | "google",
  ) {
    const window = Math.floor(Date.now() / 900000);
    return {
      key: type + ":" + digest(address) + ":" + window,
      resetsAt: new Date((window + 1) * 900000),
    };
  }
  private limited() {
    return new HttpException(
      "Too many attempts. Try again later.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  async check(address: string) {
    const row = await this.prisma.authRateLimit.findUnique({
      where: { key: this.bucket(address, "login").key },
    });
    if (row && row.attempts >= 20) throw this.limited();
  }
  async failed(address: string) {
    const bucket = this.bucket(address, "login");
    const row = await this.prisma.authRateLimit.upsert({
      where: { key: bucket.key },
      create: { ...bucket, attempts: 1 },
      update: { attempts: { increment: 1 } },
    });
    await this.prisma.authRateLimit.deleteMany({
      where: { resetsAt: { lt: new Date() } },
    });
    if (row.attempts > 20) throw this.limited();
  }
  async refresh(address: string) {
    const bucket = this.bucket(address, "refresh");
    const row = await this.prisma.authRateLimit.upsert({
      where: { key: bucket.key },
      create: { ...bucket, attempts: 1 },
      update: { attempts: { increment: 1 } },
    });
    await this.prisma.authRateLimit.deleteMany({
      where: { resetsAt: { lt: new Date() } },
    });
    if (row.attempts > 120) throw this.limited();
  }
  async publicAttempt(address: string, type: "register" | "google") {
    const bucket = this.bucket(address, type);
    const row = await this.prisma.authRateLimit.upsert({
      where: { key: bucket.key },
      create: { ...bucket, attempts: 1 },
      update: { attempts: { increment: 1 } },
    });
    await this.prisma.authRateLimit.deleteMany({
      where: { resetsAt: { lt: new Date() } },
    });
    if (row.attempts > 20) throw this.limited();
  }
}
