import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Prisma, UserRole } from "@prisma/client";
import { Request } from "express";
import { PrismaService } from "../database.prisma";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards";
import { Roles } from "../auth/auth.decorators";
import { AuthenticatedUser } from "../auth/auth.types";
import { businessDate } from "../common/business-date";
import { ScreenshotService } from "./screenshot.service";
import { OcrVerificationService } from "./ocr-verification.service";
import { ReceiptDetailsDto, UploadReceiptDto } from "./receipt.dto";
import { ReceiptOcrEngine } from "../ocr/receipt-ocr.engine";

type UserRequest = Request & { user: AuthenticatedUser };
const pageNumber = (value = "1") => {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100000)
    throw new BadRequestException("Invalid page");
  return Number(value);
};

@Controller({ version: "1" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.REVIEWER)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly screenshots: ScreenshotService,
    private readonly ocr: OcrVerificationService,
    private readonly ocrEngine: ReceiptOcrEngine,
  ) {}

  @Get("dashboard")
  async dashboard(@Query("date") date: string) {
    const business = businessDate(date);
    const [transactions, receipts, imports] = await Promise.all([
      this.prisma.paymentTransaction.count({
        where: {
          provider: "KBZPAY",
          businessDate: business,
          direction: "INCOMING",
        },
      }),
      this.prisma.paymentScreenshot.groupBy({
        by: ["status"],
        where: { businessDate: business },
        _count: true,
      }),
      this.prisma.paymentImport.count({
        where: { provider: "KBZPAY", businessDate: business },
      }),
    ]);
    return {
      transactions,
      imports,
      receipts: Object.fromEntries(receipts.map((r) => [r.status, r._count])),
      mode: "AUTOMATIC_COMPARISON",
      ocrConfigured: this.ocrEngine.isConfigured(),
      ocrDriver: this.ocrEngine.driver,
    };
  }

  @Get("imports")
  async imports(@Query("date") date: string, @Query("page") page?: string) {
    const where = {
      provider: "KBZPAY" as const,
    };
    const current = pageNumber(page);
    const [items, total] = await Promise.all([
      this.prisma.paymentImport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (current - 1) * 50,
        take: 50,
        select: {
          id: true,
          fileName: true,
          status: true,
          parsedRows: true,
          errorRows: true,
          totalRows: true,
          createdAt: true,
        },
      }),
      this.prisma.paymentImport.count({ where }),
    ]);
    return { items, total, page: current, pageSize: 50 };
  }

  @Get("imports/:id/errors")
  errors(@Param("id", ParseUUIDPipe) id: string) {
    return this.prisma.paymentImportError.findMany({
      where: { importId: id },
      take: 100,
      orderBy: { sourceRowNumber: "asc" },
      select: { sourceRowNumber: true, errorCode: true, errorMessage: true },
    });
  }

  @Get("transactions")
  async transactions(
    @Query("date") date: string,
    @Query("page") page?: string,
    @Query("search") search?: string,
  ) {
    const where: Prisma.PaymentTransactionWhereInput = {
      provider: "KBZPAY",
      businessDate: businessDate(date),
      direction: "INCOMING",
    };
    if (search?.trim()) {
      const value = search.trim().slice(0, 100);
      where.OR = [
        { externalTransactionId: { contains: value, mode: "insensitive" } },
        ...(/^\d+(?:\.\d{1,2})?$/.test(value)
          ? [{ amount: { equals: value } }]
          : []),
      ];
    }
    const current = pageNumber(page);
    const [items, total] = await Promise.all([
      this.prisma.paymentTransaction.findMany({
        where,
        orderBy: { transactionAtUtc: "desc" },
        skip: (current - 1) * 50,
        take: 50,
        select: {
          id: true,
          externalTransactionId: true,
          amount: true,
          currency: true,
          transactionAtUtc: true,
          direction: true,
          usedTransaction: { select: { screenshotId: true, usedAt: true } },
        },
      }),
      this.prisma.paymentTransaction.count({ where }),
    ]);
    return { items, total, page: current, pageSize: 50 };
  }

  @Get("screenshots")
  screenshotsList(
    @Query("date") date: string,
    @Query("page") page?: string,
    @Query("status") status?: string,
  ) {
    return this.screenshots.list(date, pageNumber(page), status);
  }

  @Post("screenshots")
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Body() dto: UploadReceiptDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: UserRequest,
  ) {
    return this.screenshots.upload(dto, file, request.user.id);
  }

  @Get("screenshots/:id")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.screenshots.detail(id);
  }

  @Delete("screenshots/:id")
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  remove(@Param("id", ParseUUIDPipe) id: string, @Req() request: UserRequest) {
    return this.screenshots.remove(id, request.user.id);
  }

  @Get("screenshots/:id/image")
  async image(@Param("id", ParseUUIDPipe) id: string) {
    const image = await this.screenshots.image(id);
    return new StreamableFile(image.bytes, {
      type: image.mimeType,
      disposition: "inline",
    });
  }

  @Post("screenshots/:id/details")
  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.REVIEWER)
  details(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReceiptDetailsDto,
    @Req() request: UserRequest,
  ) {
    return this.ocr.enterDetails(id, dto, request.user.id);
  }
}
