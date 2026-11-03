import { Body, Controller, Headers, HttpCode, Inject, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';
import { CorreoService } from '../comun/correo.service';
import { Publico } from '../comun/publico.decorator';
import { html, TelegramService } from '../comun/telegram.service';

interface Evento {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
  };
}

const ESTADOS: Record<string, 'entregado' | 'retrasado' | 'rebotado' | 'spam'> = {
  'email.delivered': 'entregado',
  'email.delivery_delayed': 'retrasado',
  'email.bounced': 'rebotado',
  'email.failed': 'rebotado',
  'email.complained': 'spam',
};

/** Un rebote o un spam no se pisa con un aviso posterior de entrega o retraso */
const PUEDE_PASAR_A: Record<string, string[]> = {
  entregado: ['enviado', 'retrasado'],
  retrasado: ['enviado'],
  rebotado: ['enviado', 'retrasado', 'entregado'],
  spam: ['enviado', 'retrasado', 'entregado', 'rebotado'],
};

/** Motivo del rebote en palabras de la oficina */
function motivo(e: Evento) {
  if (e.type === 'email.complained') return 'El cliente lo ha marcado como spam';
  if (e.type === 'email.failed') return 'No se ha podido enviar' + (e.data?.failed?.reason ? `: ${e.data.failed.reason}` : '');
  if (e.type === 'email.delivery_delayed') return 'El servidor del cliente aún no lo acepta; se sigue intentando';
  if (e.type !== 'email.bounced') return null;
  const { type, subType } = e.data?.bounce ?? {};
  if (subType === 'Suppressed' || subType === 'OnAccountSuppressionList') return 'Esta dirección ya rebotó antes y no se le envía';
  if (subType === 'MailboxFull') return 'El buzón del cliente está lleno';
  if (subType === 'MessageTooLarge') return 'El correo pesa demasiado para el buzón del cliente';
  if (subType === 'ContentRejected' || subType === 'AttachmentRejected') return 'El servidor del cliente ha rechazado el correo';
  if (type === 'Permanent') return 'La dirección no existe o no acepta correo';
  return 'El servidor del cliente no lo ha aceptado';
}

/**
 * Avisos de Resend (webhook): entregado, retrasado, rebotado o marcado como spam.
 * Resend firma cada aviso con RESEND_WEBHOOK_SECRET (formato Svix); sin él la ruta queda cerrada.
 */
@Controller('correo')
export class AvisosCorreoController {
  private readonly log = new Logger('AvisosCorreo');

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly config: ConfigService,
    private readonly correo: CorreoService,
    private readonly telegram: TelegramService,
  ) {}

  @Publico()
  @Post('eventos')
  @HttpCode(200)
  async eventos(
    @Req() req: { rawBody?: Buffer },
    @Body() evento: Evento,
    @Headers('svix-id') id?: string,
    @Headers('svix-timestamp') momento?: string,
    @Headers('svix-signature') firmas?: string,
  ) {
    this.comprobarFirma(req.rawBody, id, momento, firmas);
    const estado = ESTADOS[evento.type];
    if (!estado) return { ignorado: evento.type };

    const envio = await this.buscarEnvio(evento);
    if (!envio) {
      this.log.warn(`Aviso ${evento.type} de ${evento.data?.email_id} sin envío que casar`);
      return { casado: false };
    }
    if (!PUEDE_PASAR_A[estado].includes(envio.estado)) return { casado: true, sin_cambios: true };

    ok(
      await this.db
        .from('envios')
        .update({
          estado,
          motivo: motivo(evento),
          estado_en: evento.created_at ?? new Date().toISOString(),
          proveedor_id: evento.data?.email_id ?? envio.proveedor_id,
          revisado: false,
        })
        .eq('id', envio.id),
    );
    if (estado === 'rebotado' || estado === 'spam') {
      await this.correo.avisarProblema({ ...envio, estado, motivo: motivo(evento) }).catch((e) => this.log.error(`No se ha podido avisar del rebote: ${e.message}`));
      await this.telegram.avisar(
        'rebotes',
        [
          `🔴 <b>${estado === 'spam' ? 'Correo marcado como spam' : 'Un correo no ha llegado'}</b>`,
          `«${html(envio.asunto)}» a ${html(envio.para)}`,
          motivo(evento) ? html(motivo(evento)) : '',
        ]
          .filter(Boolean)
          .join('\n'),
        { botones: [[{ text: '👍 Ya está revisado', callback_data: `v:${envio.id}` }], [this.telegram.abrir('Revisar la factura', `/facturas/${envio.factura_id}`)]] },
      );
    }
    return { casado: true, estado };
  }

  private comprobarFirma(cuerpo?: Buffer, id?: string, momento?: string, firmas?: string) {
    const secreto = this.config.get<string>('RESEND_WEBHOOK_SECRET');
    if (!secreto || !cuerpo || !id || !momento || !firmas) throw new UnauthorizedException('No autorizado');
    // Avisos de hace más de 5 minutos no valen: así nadie puede reenviar uno capturado
    if (Math.abs(Date.now() / 1000 - Number(momento)) > 300) throw new UnauthorizedException('Aviso caducado');
    const clave = Buffer.from(secreto.replace(/^whsec_/, ''), 'base64');
    const esperada = createHmac('sha256', clave).update(`${id}.${momento}.${cuerpo.toString('utf8')}`).digest();
    const valida = firmas.split(' ').some((f) => {
      const recibida = Buffer.from(f.split(',')[1] ?? '', 'base64');
      return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
    });
    if (!valida) throw new UnauthorizedException('Firma no válida');
  }

  /** Por el id de Resend; si el envío no lo guardó, por destinatario y asunto de los últimos días */
  private async buscarEnvio(e: Evento) {
    const campos = 'id, factura_id, para, asunto, estado, proveedor_id';
    if (e.data?.email_id) {
      const porId = ok(await this.db.from('envios').select(campos).eq('proveedor_id', e.data.email_id).maybeSingle());
      if (porId) return porId;
    }
    const para = [e.data?.to].flat()[0];
    if (!para || !e.data?.subject) return null;
    const desde = new Date(Date.now() - 3 * 864e5).toISOString();
    const [candidato] = ok(
      await this.db
        .from('envios')
        .select(campos)
        .ilike('para', para)
        .eq('asunto', e.data.subject)
        .is('proveedor_id', null)
        .gte('enviado_en', desde)
        .order('enviado_en', { ascending: false })
        .limit(1),
    ) ?? [];
    return candidato ?? null;
  }
}
