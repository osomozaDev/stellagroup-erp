import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configurar } from './configurar';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true }); // la firma de los avisos de Resend se comprueba sobre el cuerpo tal cual
  configurar(app);
  const port = Number(process.env.PORT ?? 3101);
  await app.listen(port);
  console.log(`API de Stella ERP en http://localhost:${port}/api`);
}
bootstrap();
