import {
  Controller,
  Param,
  Post,
  Query,
  Req,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { AuthenticatedUser } from "../auth/auth.types";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards";
import { Roles } from "../auth/auth.decorators";
import { OcrVerificationService } from "./ocr-verification.service";

@Controller({ path: "verification/screenshots", version: "1" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.REVIEWER)
export class OcrVerificationController {
  constructor(private readonly service: OcrVerificationService) {}

  @Post(":screenshotId/process")
  process(
    @Param("screenshotId", ParseUUIDPipe) screenshotId: string,
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    return this.service.processScreenshot(
      screenshotId,
      undefined,
      request.user.id,
    );
  }
}
