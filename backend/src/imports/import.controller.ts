import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/auth.decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/auth.guards';
import { CreateImportDto } from './import.dto';
import { ImportService } from './import.service';

@Controller({ path: 'imports', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.OPERATOR)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  stageUpload(
    @Body() dto: CreateImportDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: Request & { user?: AuthenticatedUser },
  ) {
    const userId = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated uploader is required');
    }
    return this.importService.stageUpload(dto, file, userId);
  }
}
