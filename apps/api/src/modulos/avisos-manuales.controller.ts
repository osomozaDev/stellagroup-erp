import { Body, Controller, Get, Headers, Inject, Post, Req, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';
import { Publico } from '../comun/publico.decorator';
import { ZodPipe } from '../comun/zod.pipe';
import { html, TelegramService } from '../comun/telegram.service';

const avisoSchema = z.object({
  /** usuario_id o nombre del chat («Javi»); vacío o «todos», a todos los conectados */
  para: z.array(z.string().trim().min(1)).max(50).default([]),
  texto: z.string().trim().min(1, 'Escribe el aviso').max(3500, 'El aviso es demasiado largo para Telegram'),
});
type Aviso = z.infer<typeof avisoSchema>;

/**
 * Avisos escritos a mano que el bot manda por Telegram a los usuarios conectados.
 * Desde la app (solo con el permiso de usuarios) o desde fuera con la clave STELLA_AVISOS_KEY
 * en la cabecera x-api-key (lo usa el MCP de avisos).
 */
@Controller('avisos')
export class AvisosManualesController {
  private readonly clave?: string;

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
    config: ConfigService,
  ) {
    this.clave = config.get<string>('STELLA_AVISOS_KEY') || undefined;
  }

  private async conectados() {
    return (ok(await this.db.from('telegram_chats').select('usuario_id, nombre, chat_id').not('chat_id', 'is', null).order('nombre')) ?? []) as {
      usuario_id: string;
      nombre: string | null;
      chat_id: number;
    }[];
  }

  private async destinatarios() {
    return (await this.conectados()).map(({ usuario_id, nombre }) => ({ usuario_id, nombre }));
  }

  private async mandar({ para, texto }: Aviso, firma: string | null) {
    if (!this.telegram.configurado) throw new ServiceUnavailableException('El bot de Telegram no está configurado');
    const chats = await this.conectados();
    const todos = !para.length || para.some((p) => p.toLowerCase() === 'todos');
    const elegidos = todos
      ? chats
      : chats.filter((c) => para.some((p) => p === c.usuario_id || p.toLowerCase() === (c.nombre ?? '').toLowerCase()));
    const sinChat = todos ? [] : para.filter((p) => !elegidos.some((c) => p === c.usuario_id || p.toLowerCase() === (c.nombre ?? '').toLowerCase()));
    const mensaje = `📣 <b>Aviso${firma ? ` de ${html(firma)}` : ''}</b>\n\n${html(texto)}`;
    const enviados: string[] = [];
    const fallidos: { nombre: string | null; error: string }[] = [];
    for (const c of elegidos) {
      try {
        await this.telegram.enviar(c.chat_id, mensaje);
        enviados.push(c.nombre ?? c.usuario_id);
      } catch (e: any) {
        fallidos.push({ nombre: c.nombre, error: e.message });
      }
    }
    return { enviados, fallidos, sin_telegram: sinChat };
  }

  // ── Desde la app ──

  @Get('destinatarios')
  verDestinatarios() {
    return this.destinatarios();
  }

  @Post()
  async enviar(@Req() req: any, @Body(new ZodPipe(avisoSchema)) body: Aviso) {
    const yo = ok(await this.db.from('telegram_chats').select('nombre').eq('usuario_id', req.user.id).maybeSingle()) as any;
    return this.mandar(body, yo?.nombre ?? req.user.email ?? null);
  }

  // ── Desde fuera (MCP), con la clave ──

  private comprobarClave(recibida?: string) {
    const a = Buffer.from(recibida ?? '');
    const b = Buffer.from(this.clave ?? '');
    if (!this.clave || a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Clave de avisos no válida');
  }

  @Publico()
  @Get('externo/destinatarios')
  destinatariosExterno(@Headers('x-api-key') clave?: string) {
    this.comprobarClave(clave);
    return this.destinatarios();
  }

  @Publico()
  @Post('externo')
  enviarExterno(@Headers('x-api-key') clave: string | undefined, @Body(new ZodPipe(avisoSchema.extend({ firma: z.string().trim().max(60).optional() }))) body: Aviso & { firma?: string }) {
    this.comprobarClave(clave);
    return this.mandar(body, body.firma || null);
  }
}
