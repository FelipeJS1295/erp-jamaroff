import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { siiRut } from './rut.js';

/**
 * Cliente de API Gateway (https://www.apigateway.cl) para el SII.
 *
 * Variables del .env:
 *   APIGATEWAY_TOKEN   token de la "conexión" creada en API Gateway
 *   SII_EMISOR_RUT     RUT de la EMPRESA que emite la boleta (ej: 76123456-7)
 *   SII_USUARIO_RUT    RUT de la PERSONA que entra al SII (la misma con que haces las boletas a mano)
 *   SII_USUARIO_CLAVE  clave del SII de esa persona
 *   APIGATEWAY_URL     (opcional) por defecto https://app.apigateway.cl/api/v2
 *
 * Igual que en el portal: se entra con el RUT y clave personales y se emite a nombre de la empresa
 * (la persona debe estar autorizada como usuario de eBoleta de la empresa).
 * Si la empresa tiene clave propia, SII_USUARIO_RUT puede ser el mismo RUT de la empresa.
 * Las credenciales van en cada llamada (API Gateway no las guarda).
 */

/** El SII/API Gateway respondió con un error claro: la boleta NO se emitió */
export class SiiRejectedError extends Error {}

/** No se sabe si se emitió (se cortó la conexión, timeout, error 5xx) */
export class SiiUnknownError extends Error {}

export interface EboletaResult {
  folio: number;
  dte: number;
  pdfUrl: string | null;
  /** PDF en base64 (sin el prefijo "data:...;base64,") */
  pdfBase64: string | null;
  raw: unknown;
}

export interface EboletaInput {
  /** 39 afecta · 41 exenta */
  tipo: 39 | 41;
  /** RUT del cliente (o el genérico 66666666-6) */
  receptorRut: string;
  /** Nombre del ítem (eBoleta admite un solo ítem por boleta) */
  item: string;
  /** Total con IVA */
  total: number;
}

@Injectable()
export class ApiGatewayClient {
  private readonly logger = new Logger(ApiGatewayClient.name);

  /** ¿Está configurado? (para mostrar u ocultar los botones) */
  config() {
    const token = process.env.APIGATEWAY_TOKEN?.trim();
    const rut = siiRut(process.env.SII_EMISOR_RUT);
    const userRut = siiRut(process.env.SII_USUARIO_RUT);
    const clave = process.env.SII_USUARIO_CLAVE;
    return {
      enabled: Boolean(token && rut && userRut && clave),
      rut,
      userRut,
      missing: [
        !token && 'APIGATEWAY_TOKEN',
        !rut && 'SII_EMISOR_RUT',
        !userRut && 'SII_USUARIO_RUT',
        !clave && 'SII_USUARIO_CLAVE',
      ].filter(Boolean) as string[],
    };
  }

  private credentials() {
    const cfg = this.config();
    if (!cfg.enabled) {
      throw new ServiceUnavailableException(
        `La emisión en el SII no está configurada. Falta en el .env: ${cfg.missing.join(', ')}`,
      );
    }
    return {
      token: process.env.APIGATEWAY_TOKEN!.trim(),
      /** RUT de la empresa (emisor de la boleta) */
      rut: cfg.rut!,
      /** RUT y clave de la persona que entra al SII */
      userRut: cfg.userRut!,
      clave: process.env.SII_USUARIO_CLAVE!,
      url: (process.env.APIGATEWAY_URL ?? 'https://app.apigateway.cl/api/v2').replace(/\/+$/, ''),
    };
  }

  private async post(path: string, body: Record<string, unknown>, timeoutMs = 90000): Promise<Response> {
    const c = this.credentials();
    try {
      return await fetch(`${c.url}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${c.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ auth: { pass: { rut: c.userRut, clave: c.clave } }, ...body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // No se alcanzó a conectar: seguro que no se emitió nada
      const code = (err as { cause?: { code?: string } }).cause?.code ?? '';
      if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
        throw new SiiRejectedError(`No se pudo conectar con API Gateway (${code})`);
      }
      // Timeout o corte a medio camino: no se sabe si se emitió
      throw new SiiUnknownError(`Sin respuesta de API Gateway: ${(err as Error).message}`);
    }
  }

  /** Mensaje de error de la respuesta (API Gateway responde { message } o similar) */
  private async errorMessage(res: Response): Promise<string> {
    const text = await res.text().catch(() => '');
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const msg = json.message ?? json.error ?? json.detail ?? json.errors;
      if (msg) return typeof msg === 'string' ? msg : JSON.stringify(msg);
    } catch {
      /* no es JSON */
    }
    return text.slice(0, 300) || `Error ${res.status}`;
  }

  /** Emite una boleta en el portal eBoleta del SII */
  async emitirBoleta(input: EboletaInput): Promise<EboletaResult> {
    const { rut, userRut } = this.credentials();
    const dte = {
      // El "vendedor" es quien emite en el portal: la persona con que se entra al SII
      vendedor: userRut,
      Encabezado: {
        IdDoc: { TipoDTE: input.tipo, MedioPago: 1 },
        Emisor: { RUTEmisor: rut, CdgSIISucur: 0 },
        Receptor: { RUTRecep: input.receptorRut },
      },
      Detalle: [{ NmbItem: input.item, QtyItem: 1, PrcItem: Math.round(input.total) }],
    };
    const res = await this.post('/sii/eboleta/emitidas/emitir', { dte });

    if (!res.ok) {
      const message = await this.errorMessage(res);
      this.logger.warn(`eBoleta ${res.status}: ${message}`);
      // 4xx = rechazada (datos, clave, token, créditos): no se emitió
      if (res.status >= 400 && res.status < 500) throw new SiiRejectedError(message);
      throw new SiiUnknownError(`API Gateway respondió ${res.status}: ${message}`);
    }

    const body = (await res.json()) as { data?: { folio?: number | string; dte?: number; pdf?: string; pdf_base64?: string } };
    const data = body.data ?? {};
    const folio = Number(data.folio);
    if (!Number.isFinite(folio) || folio <= 0) {
      throw new SiiUnknownError('API Gateway no devolvió el folio de la boleta');
    }
    return {
      folio,
      dte: Number(data.dte ?? input.tipo),
      pdfUrl: data.pdf ?? null,
      pdfBase64: data.pdf_base64 ? data.pdf_base64.replace(/^data:[^,]*,/, '') : null,
      raw: { ...data, pdf_base64: data.pdf_base64 ? '(guardado aparte)' : undefined },
    };
  }

  /** PDF de una boleta ya emitida */
  async pdfBoleta(folio: number, dte: number, fecha: string): Promise<Buffer> {
    const { rut } = this.credentials();
    const res = await this.post(
      '/sii/eboleta/emitidas/pdf',
      { contribuyente: rut.split('-')[0], folio, dte, fecha },
      60000,
    );
    if (!res.ok) throw new BadGatewayException(`No se pudo obtener el PDF: ${await this.errorMessage(res)}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
