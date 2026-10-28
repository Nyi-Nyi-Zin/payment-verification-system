import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Request } from "express";
import { JwtAuthGuard, RolesGuard } from "../auth/auth.guards";
import { Roles } from "../auth/auth.decorators";
import { AuthenticatedUser } from "../auth/auth.types";
import { ResolveReviewDto } from "./review.dto";
import { ReviewService } from "./review.service";

@Controller({ path: "reviews", version: "1" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.REVIEWER)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Patch(":screenshotId/resolve")
  resolve(
    @Param("screenshotId", ParseUUIDPipe) screenshotId: string,
    @Body() dto: ResolveReviewDto,
    @Req() request: Request & { user?: AuthenticatedUser },
  ) {
    const reviewerId = request.user?.id;
    if (!reviewerId) {
      throw new UnauthorizedException("Authenticated reviewer is required");
    }
    return this.reviewService.resolve(screenshotId, dto, reviewerId);
  }
}
