import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { z } from 'zod';
import { FirmarInput, firmarSchema, rechazarFirmaSchema } from '@stella/shared';
import { Publico } from '../comun/publico.decorator';
import { ZodPipe } from '../comun/zod.pipe';
import { FirmasService } from './firmas.service';

const enlace = z.object({ t: z.string().min(20).max(100) });

/** IP real del firmante: en Vercel llega en x-forwarded-for */
const ipDe = (req: Request) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || null;

/**
 * Página pública de firma: quien firma no es usuario de la app. Cada ruta recibe el
 * enlace personal (en el cuerpo, nunca en la dirección) y solo da acceso a ese documento.
 */
@Publico()
@Controller('firmar')
export class FirmarController {
  constructor(private readonly firmas: FirmasService) {}

  @Post('ver')
  ver(@Body(new ZodPipe(enlace)) { t }: { t: string }) {
    return this.firmas.ver(t);
  }

  @Post('codigo')
  codigo(@Body(new ZodPipe(enlace)) { t }: { t: string }) {
    return this.firmas.pedirCodigo(t);
  }

  @Post('firmar')
  firmar(@Body(new ZodPipe(enlace.and(firmarSchema))) body: FirmarInput & { t: string }, @Req() req: Request) {
    const { t, ...datos } = body;
    return this.firmas.firmar(t, datos, ipDe(req), req.headers['user-agent'] ?? null);
  }

  @Post('rechazar')
  rechazar(@Body(new ZodPipe(enlace.and(rechazarFirmaSchema))) body: { t: string; motivo: string }) {
    return this.firmas.rechazar(body.t, body.motivo);
  }

  @Post('pdf')
  async pdf(@Body(new ZodPipe(enlace)) { t }: { t: string }, @Res() res: Response) {
    const { pdf, nombre } = await this.firmas.pdfPorEnlace(t);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    res.send(pdf);
  }
}
