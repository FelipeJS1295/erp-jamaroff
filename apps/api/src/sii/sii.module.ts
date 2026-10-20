import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module.js';
import { ApiGatewayClient } from './api-gateway.client.js';
import { CreditNotesController } from './credit-notes.controller.js';
import { CreditNotesService } from './credit-notes.service.js';
import { PurchasesImportController } from './purchases-import.controller.js';
import { PurchasesImportService } from './purchases-import.service.js';
import { SiiController } from './sii.controller.js';
import { SiiService } from './sii.service.js';

@Module({
  // Los datos del cliente y los montos de la orden salen de Ventas
  imports: [SalesModule],
  controllers: [SiiController, CreditNotesController, PurchasesImportController],
  providers: [SiiService, ApiGatewayClient, CreditNotesService, PurchasesImportService],
  exports: [CreditNotesService],
})
export class SiiModule {}
