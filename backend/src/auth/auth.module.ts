import { LoginThrottle } from "./login-throttle";
import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { JwtAuthGuard, RolesGuard } from "./auth.guards";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: validatedSecret(config),
        signOptions: { expiresIn: "15m" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [LoginThrottle, AuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtModule, AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}

function validatedSecret(config: ConfigService): string {
  const secret = config.getOrThrow<string>("JWT_SECRET");
  const refresh = config.getOrThrow<string>("JWT_REFRESH_SECRET");
  if (
    secret.length < 32 ||
    refresh.length < 32 ||
    secret === refresh ||
    secret.startsWith("replace-") ||
    refresh.startsWith("replace-")
  ) {
    throw new Error(
      "Set distinct, randomly generated JWT_SECRET and JWT_REFRESH_SECRET values (at least 32 characters)",
    );
  }
  return secret;
}
