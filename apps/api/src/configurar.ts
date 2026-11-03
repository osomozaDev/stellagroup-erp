import { NestExpressApplication } from '@nestjs/platform-express';

/** Configuración común de la API, tanto en local como en Vercel */
export function configurar(app: NestExpressApplication) {
  app.useBodyParser('json', { limit: '2mb' }); // el logo va dentro de los datos de la empresa
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_URL?.split(',') ?? true });
}
