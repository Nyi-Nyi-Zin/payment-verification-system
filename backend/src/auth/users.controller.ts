import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { UserRole } from "@prisma/client";
import { Roles } from "./auth.decorators";
import { JwtAuthGuard, RolesGuard } from "./auth.guards";
import { AuthenticatedUser } from "./auth.types";
import { UsersService } from "./users.service";
import { CreateUserDto, UpdateUserDto } from "./users.dto";
type UserRequest = Request & { user: AuthenticatedUser };
@Controller({ path: "users", version: "1" })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  list(@Query("page") page = "1") {
    return this.users.list(Number(page));
  }
  @Post()
  create(@Body() dto: CreateUserDto, @Req() request: UserRequest) {
    return this.users.create(dto, request.user);
  }
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: UserRequest,
  ) {
    return this.users.update(id, dto, request.user);
  }
  @Post(":id/reset-password")
  reset(@Param("id", ParseUUIDPipe) id: string, @Req() request: UserRequest) {
    return this.users.resetPassword(id, request.user);
  }
}
