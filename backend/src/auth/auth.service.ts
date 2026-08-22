import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../database.prisma';
import { AuthenticatedUser } from './auth.types';
import { LoginDto, RefreshTokenDto } from './auth.dto';

interface TokenPayload extends AuthenticatedUser {
  tokenType: 'access' | 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { emailOrPhone: dto.emailOrPhone.trim() },
    });

    if (!user || user.status !== 'ACTIVE' || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const identity: AuthenticatedUser = {
      id: user.id,
      role: user.role,
      emailOrPhone: user.emailOrPhone,
    };
    const tokens = await this.issueTokens(identity);
    const refreshTokenHash = await hash(tokens.refreshToken, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash, lastLoginAt: new Date() },
    });

    return { ...tokens, user: identity };
  }

  async refresh(dto: RefreshTokenDto) {
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(dto.refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.tokenType !== 'refresh' || !payload.id) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || user.status !== 'ACTIVE' || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh session is not active');
    }

    const validToken = await compare(dto.refreshToken, user.refreshTokenHash);
    if (!validToken) {
      throw new UnauthorizedException('Refresh session is not active');
    }

    const identity: AuthenticatedUser = {
      id: user.id,
      role: user.role,
      emailOrPhone: user.emailOrPhone,
    };
    const tokens = await this.issueTokens(identity);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await hash(tokens.refreshToken, 12) },
    });

    return { ...tokens, user: identity };
  }

  async logout(userId: string): Promise<{ success: true }> {
    await this.prisma.user.updateMany({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { success: true };
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is not active');
    }
    return {
      id: user.id,
      role: user.role,
      emailOrPhone: user.emailOrPhone,
    };
  }

  private async issueTokens(user: AuthenticatedUser) {
    const common = { id: user.id, role: user.role, emailOrPhone: user.emailOrPhone };
    const accessToken = await this.jwt.signAsync(
      { ...common, tokenType: 'access' as const },
      { expiresIn: '15m' },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...common, tokenType: 'refresh' as const },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      },
    );
    return { accessToken, refreshToken };
  }
}
