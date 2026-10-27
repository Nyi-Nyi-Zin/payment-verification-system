import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

@Injectable()
export class LoginThrottle {
  private readonly attempts = new Map<
    string,
    { count: number; until: number }
  >();
  check(address: string) {
    const now = Date.now();
    if (this.attempts.size > 10000) {
      for (const [key, entry] of this.attempts)
        if (entry.until < now) this.attempts.delete(key);
      if (this.attempts.size > 10000)
        throw new HttpException(
          "Please try again later",
          HttpStatus.TOO_MANY_REQUESTS,
        );
    }
    const previous = this.attempts.get(address);
    const entry =
      previous && previous.until > now
        ? previous
        : { count: 0, until: now + 15 * 60 * 1000 };
    if (++entry.count > 20)
      throw new HttpException(
        "Too many sign-in attempts. Try again in 15 minutes.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.attempts.set(address, entry);
  }
}
