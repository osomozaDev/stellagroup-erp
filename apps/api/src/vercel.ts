import 'reflect-metadata';
import express from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurar } from './configurar';

/**
 * Entrada de la API en Vercel (función sin servidor). La app de Nest se crea una
 * vez y se reutiliza mientras la función siga caliente.
 */
let servidor: Promise<express.Express> | undefined;

async function crear() {
  const exp = express();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(exp), {
    logger: ['error', 'warn'],
    rawBody: true, // la firma de los avisos de Resend se comprueba sobre el cuerpo tal cual
  });
  configurar(app);
  await app.init();
  return exp;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Si el arranque falla no se guarda el error: la siguiente petición lo reintenta
  servidor ??= crear().catch((e) => {
    servidor = undefined;
    throw e;
  });
  (await servidor)(req as express.Request, res as express.Response);
}
