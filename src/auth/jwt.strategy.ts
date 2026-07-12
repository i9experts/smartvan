/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // 🟢 Get token from header
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'), // 🟢 Secret from .env
    });
  }

async validate(payload: any) {
  return {
    userId: payload.sub,
    email: payload.email,
    userType: payload.userType || null, // for driver/parent
    role: payload.role || null,         // for admin/superadmin/employee
    permissions: payload.permissions || [], // for employee
  };
}
}
