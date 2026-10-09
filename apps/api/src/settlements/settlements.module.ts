import { Module } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  controllers: [SettlementsController],
  providers: [SettlementsService, ReconciliationService],
  // El dashboard (módulo de reportes) usa la conciliación
  exports: [SettlementsService, ReconciliationService],
})
export class SettlementsModule {}