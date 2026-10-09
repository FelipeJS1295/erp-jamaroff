import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { UsersController } from './users.controller.js';

@Module({
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    // Guardia global: todas las rutas piden sesión salvo las @Public()
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}