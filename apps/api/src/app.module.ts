import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { ProductsModule } from './products/products.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SalesIngestionModule } from './sales-ingestion/sales-ingestion.module.js';
import { SalesModule } from './sales/sales.module.js';
import { SettlementsModule } from './settlements/settlements.module.js';
import { CatalogModule } from './catalog/catalog.module.js';

@Module({
  imports: [
    // Carga variables desde .env (primero el de la app, luego el de la raíz)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    DatabaseModule,
    AuthModule,
    HealthModule,
    ProductsModule,
    ReportsModule,
    SalesIngestionModule,
    SalesIngestionModule,
    SalesModule,
    SettlementsModule,
    CatalogModule,
  ],
})
export class AppModule {}