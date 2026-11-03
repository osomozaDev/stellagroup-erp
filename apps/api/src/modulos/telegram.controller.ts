import {
  BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Inject, Logger, Patch, Post, Req, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';
import { Publico } from '../comun/publico.decorator';
import { ZodPipe } from '../comun/zod.pipe';
import { TelegramService, TIPOS_AVISO } from '../comun/telegram.service';
import { AvisosTelegramService } from './avisos-telegram.service';
import { BotTelegramService } from './bot-telegram.service';

const avisosSchema = z.object({ avisos: z.array(z.enum(TIPOS_AVISO.map((t) => t.clave) as [string, ...string[]])) });

/** Conectar el chat de cada usuario y lo que el bot recibe de Telegram */
@Controller('telegram')
export class TelegramController {
  private readonly log = new Logger('Telegram');

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
    private readonly avisos: AvisosTelegramService,
    private readonly bot: BotTelegramService,
  ) {}

  private async miChat(usuarioId: string) {
    return ok(await this.db.from('telegram_chats').select('chat_id, nombre, avisos, vinculado_en').eq('usuario_id', usuarioId).maybeSingle());
  }

  @Get()
  async estado(@Req() req: any) {
    const chat = await this.miChat(req.user.id);
    return {
      configurado: this.telegram.configurado,
      bot: this.telegram.configurado ? await this.telegram.nombreBot() : null,
      conectado: !!chat?.chat_id,
      nombre: chat?.nombre ?? null,
      avisos: chat?.avisos ?? TIPOS_AVISO.map((t) => t.clave),
      tipos: TIPOS_AVISO,
    };
  }

  /** Código de un solo uso: el usuario abre t.me/bot?start=código y el bot le conecta */
  @Post('conectar')
  conectar(@Req() req: any) {
    return this.telegram.crearEnlace(req.user.id, 15);
  }

  @Patch()
  async guardar(@Req() req: any, @Body(new ZodPipe(avisosSchema)) body: z.infer<typeof avisosSchema>) {
    ok(await this.db.from('telegram_chats').update({ avisos: body.avisos }).eq('usuario_id', req.user.id));
    return this.estado(req);
  }

  @Post('prueba')
  async prueba(@Req() req: any) {
    const chat = await this.miChat(req.user.id);
    if (!chat?.chat_id) throw new BadRequestException('Primero conecta tu Telegram');
    await this.telegram.enviar(chat.chat_id, await this.avisos.textoResumen('👋 <b>Prueba desde Stella ERP</b>\nAsí te llegarán los avisos.'));
    return { ok: true };
  }

  @Delete()
  async desconectar(@Req() req: any) {
    const chat = await this.miChat(req.user.id);
    ok(await this.db.from('telegram_chats').delete().eq('usuario_id', req.user.id));
    if (chat?.chat_id) await this.telegram.enviar(chat.chat_id, 'Te has desconectado de Stella ERP. Ya no te llegarán avisos.').catch(() => undefined);
    return { ok: true };
  }

  /** Telegram llama aquí con cada mensaje al bot; la cabecera secreta demuestra que es Telegram */
  @Publico()
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Body() update: any, @Headers('x-telegram-bot-api-secret-token') secreto?: string) {
    const esperado = this.telegram.secretoWebhook;
    const a = Buffer.from(secreto ?? '');
    const b = Buffer.from(esperado ?? '');
    if (!esperado || a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('No autorizado');

    // Siempre se contesta 200: si no, Telegram reintenta el mismo mensaje
    try {
      if (update?.callback_query) await this.bot.boton(update.callback_query);
      const m = update?.message;
      const texto = String(m?.text ?? '').trim();
      if (m?.chat?.id && texto) await this.bot.mensaje(m.chat.id, texto, m.from, m.reply_to_message);
    } catch (e: any) {
      this.log.error(`Error con el mensaje de Telegram: ${e.message}`);
    }
    return { ok: true };
  }

  /**
   * Desde la Mini App: enlace de un solo uso para seguir en el navegador con la misma sesión.
   * Va en el «#» de la dirección, que no llega a ningún servidor ni queda en los registros.
   */
  @Post('navegador')
  async navegador(@Req() req: any, @Body('ruta') ruta?: string) {
    if (!req.user?.email) throw new UnauthorizedException('Tu usuario no tiene correo');
    const { data, error } = await this.db.auth.admin.generateLink({ type: 'magiclink', email: req.user.email });
    if (error) throw new ServiceUnavailableException('No se ha podido preparar el enlace');
    // Solo rutas de la propia app, para que el enlace no pueda llevar a otra web
    const destino = typeof ruta === 'string' && /^\/(?!\/)/.test(ruta) ? ruta : '/';
    return { url: `${this.telegram.web}${destino}#entrar=${data.properties.hashed_token}` };
  }

  /**
   * Mini App: Telegram abre la app con unos datos firmados con el token del bot
   * (initData). Si son buenos y ese Telegram está conectado, se entra con su usuario sin contraseña.
   */
  @Publico()
  @Post('entrar')
  @HttpCode(200)
  async entrar(@Body('initData') initData?: string) {
    const datos = this.telegram.comprobarInitData(initData ?? '');
    if (!datos) throw new UnauthorizedException('No se ha podido comprobar que vienes de Telegram');
    const chat = ok(await this.db.from('telegram_chats').select('usuario_id').eq('chat_id', datos.id).maybeSingle());
    if (!chat) throw new UnauthorizedException('Este Telegram aún no está conectado. Entra con tu correo y conéctalo en Mi empresa.');
    const { data: usuario, error } = await this.db.auth.admin.getUserById(chat.usuario_id);
    if (error || !usuario.user?.email) throw new UnauthorizedException('Tu usuario ya no existe');
    // Enlace de acceso de un solo uso (no se manda por correo): la web lo canjea por una sesión
    const { data: enlace, error: errorEnlace } = await this.db.auth.admin.generateLink({ type: 'magiclink', email: usuario.user.email });
    if (errorEnlace) throw new ServiceUnavailableException('No se ha podido abrir la sesión');
    return { token_hash: enlace.properties.hashed_token };
  }
}
