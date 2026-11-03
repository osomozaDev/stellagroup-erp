import { Inject, Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE } from './supabase.module';
import { ok } from './db';

/** Avisos que cada usuario puede activar o quitar desde la app */
export const TIPOS_AVISO = [
  { clave: 'rebotes', nombre: 'Correos que no llegan', descripcion: 'Si una factura o recordatorio rebota o acaba en spam' },
  { clave: 'cobradas', nombre: 'Facturas cobradas', descripcion: 'Cuando alguien marca una factura como cobrada' },
  { clave: 'vencidas', nombre: 'Facturas que vencen', descripcion: 'Por la mañana, las facturas que han vencido sin cobrar' },
  { clave: 'facturar', nombre: 'Fin de mes', descripcion: 'Los últimos días del mes, si quedan proyectos por horas sin facturar' },
  { clave: 'renovaciones', nombre: 'Renovaciones', descripcion: 'Una semana antes de que renueve un hosting, dominio o mantenimiento' },
  { clave: 'firmas', nombre: 'Firmas', descripcion: 'Cuando un cliente firma o rechaza un presupuesto o un contrato' },
  { clave: 'semanal', nombre: 'Resumen de los lunes', descripcion: 'Lo que te deben, lo vencido y lo facturado y cobrado la semana pasada' },
] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number]['clave'];

/** Fila de botones bajo un mensaje: acciones (callback_data) o abrir la app dentro de Telegram (web_app) */
export type Boton = { text: string; callback_data: string } | { text: string; web_app: { url: string } } | { text: string; url: string };
export type Botones = Boton[][];

/** Texto para mensajes con parse_mode HTML */
export const html = (t: unknown) => String(t ?? '').replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x]!);

/**
 * Bot de Telegram (TELEGRAM_BOT_TOKEN). Sin token no se manda nada y la app lo
 * enseña como «sin configurar».
 */
@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly log = new Logger('Telegram');
  private readonly token?: string;
  private readonly apiUrl: string;
  readonly web: string;
  private usuario?: Promise<string | null>;

  constructor(
    config: ConfigService,
    @Inject(SUPABASE) private readonly db: SupabaseClient,
  ) {
    this.token = config.get<string>('TELEGRAM_BOT_TOKEN');
    // En local se puede apuntar a un Telegram de mentira para probar
    this.apiUrl = config.get<string>('TELEGRAM_API_URL') ?? 'https://api.telegram.org';
    this.web = (config.get<string>('WEB_URL')?.split(',')[0] ?? 'http://localhost:5183').replace(/\/$/, '');
  }

  /**
   * Tras publicar una versión nueva, el webhook puede tener una configuración vieja
   * (p. ej. sin botones): se comprueba al arrancar y se corrige si hace falta.
   */
  onModuleInit() {
    if (!this.token || !this.web.startsWith('https://')) return;
    this.llamar<{ url: string; allowed_updates?: string[] }>('getWebhookInfo')
      .then((w) => (w.url && !w.allowed_updates?.includes('callback_query') ? this.activarWebhook() : undefined))
      .catch((e) => this.log.error(`No se ha podido revisar el webhook: ${e.message}`));
  }

  get configurado() {
    return !!this.token;
  }

  /** Telegram manda este valor en cada llamada al webhook: sale del token, así no hace falta otra clave */
  get secretoWebhook() {
    return this.token ? createHmac('sha256', this.token).update('webhook').digest('hex') : null;
  }

  /**
   * Datos con los que Telegram abre la Mini App (initData). Se firman con el token
   * del bot; si la firma no cuadra o tienen más de un día, no valen.
   */
  comprobarInitData(initData: string): { id: number; nombre: string | null } | null {
    if (!this.token || !initData) return null;
    const datos = new URLSearchParams(initData);
    const hash = datos.get('hash');
    if (!hash) return null;
    datos.delete('hash');
    const comprobar = [...datos.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const clave = createHmac('sha256', 'WebAppData').update(this.token).digest();
    const esperado = Buffer.from(createHmac('sha256', clave).update(comprobar).digest('hex'));
    const recibido = Buffer.from(hash);
    if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) return null;
    if (Date.now() / 1000 - Number(datos.get('auth_date')) > 86400) return null;
    try {
      const u = JSON.parse(datos.get('user') ?? '');
      return typeof u?.id === 'number' ? { id: u.id, nombre: [u.first_name, u.last_name].filter(Boolean).join(' ') || null } : null;
    } catch {
      return null;
    }
  }

  async llamar<T = any>(metodo: string, datos: Record<string, unknown> = {}): Promise<T> {
    if (!this.token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
    const r = await fetch(`${this.apiUrl}/bot${this.token}/${metodo}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(datos),
    });
    const res = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok) throw new Error(res.description ?? `Telegram respondió ${r.status}`);
    return res.result as T;
  }

  /** Manda un archivo al chat (dentro de Telegram la app no puede descargar archivos) */
  async enviarArchivo(chatId: number | string, archivo: Buffer, nombre: string, texto?: string) {
    if (!this.token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
    const datos = new FormData();
    datos.set('chat_id', String(chatId));
    datos.set('document', new Blob([new Uint8Array(archivo)]), nombre);
    if (texto) {
      datos.set('caption', texto);
      datos.set('parse_mode', 'HTML');
    }
    const r = await fetch(`${this.apiUrl}/bot${this.token}/sendDocument`, { method: 'POST', body: datos });
    const res = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok) throw new Error(res.description ?? `Telegram respondió ${r.status}`);
  }

  /** @usuario del bot, para el enlace t.me/… */
  nombreBot() {
    this.usuario ??= this.llamar<{ username: string }>('getMe')
      .then((b) => b.username)
      .catch((e) => {
        this.usuario = undefined;
        this.log.error(`No se ha podido leer el bot: ${e.message}`);
        return null;
      });
    return this.usuario;
  }

  /**
   * Enlace t.me/bot?start=código de un solo uso que conecta el Telegram de quien lo
   * abra con este usuario. Lo genera el propio usuario (15 min) o un administrador
   * para mandárselo (7 días).
   */
  async crearEnlace(usuarioId: string, minutos: number) {
    if (!this.token) throw new ServiceUnavailableException('El bot de Telegram aún no está configurado');
    const bot = await this.nombreBot();
    if (!bot) throw new ServiceUnavailableException('No se puede hablar con Telegram. Revisa TELEGRAM_BOT_TOKEN.');
    await this.activarWebhook().catch((e) => {
      throw new ServiceUnavailableException(`Telegram no acepta el webhook: ${e.message}`);
    });
    const codigo = randomBytes(12).toString('base64url');
    const caduca = new Date(Date.now() + minutos * 60e3).toISOString();
    ok(await this.db.from('telegram_chats').upsert({ usuario_id: usuarioId, codigo, codigo_caduca: caduca }, { onConflict: 'usuario_id' }));
    return { enlace: `https://t.me/${bot}?start=${codigo}`, caduca };
  }

  /** Apunta el webhook del bot a esta API (se hace cada vez que alguien conecta su chat) */
  async activarWebhook() {
    await this.llamar('setWebhook', {
      url: `${this.web}/api/telegram/webhook`,
      secret_token: this.secretoWebhook,
      allowed_updates: ['message', 'callback_query'],
    });
    // Botón «Abrir app» junto al cuadro de texto: la misma aplicación dentro de Telegram (Mini App)
    if (this.web.startsWith('https://')) {
      await this.llamar('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Abrir app', web_app: { url: this.web } } });
    }
    await this.llamar('setMyCommands', {
      commands: [
        { command: 'menu', description: 'Botones con todo lo que puedes hacer' },
        { command: 'facturar', description: 'Facturar el mes y mandarlo a los clientes' },
        { command: 'resumen', description: 'Lo que te deben y lo vencido' },
        { command: 'pendientes', description: 'Facturas sin cobrar' },
        { command: 'facturas', description: 'Todas las facturas' },
        { command: 'cliente', description: 'Buscar un cliente: /cliente nombre' },
        { command: 'factura', description: 'Ver una factura: /factura 30' },
        { command: 'proyecto', description: 'Buscar un proyecto: /proyecto nombre' },
        { command: 'renovaciones', description: 'Servicios que renuevan pronto' },
        { command: 'semana', description: 'Resumen de los últimos 7 días' },
        { command: 'parar', description: 'Dejar de recibir avisos' },
      ],
    });
  }

  /** Botón que abre una pantalla de la app dentro de Telegram */
  abrir(texto: string, ruta: string): Boton {
    const url = `${this.web}${ruta}`;
    // Telegram solo abre Mini Apps con https; en local queda como enlace normal
    return url.startsWith('https://') ? { text: texto, web_app: { url } } : { text: texto, url };
  }

  enviar(chatId: number | string, texto: string, botones?: Botones) {
    return this.llamar('sendMessage', {
      chat_id: chatId,
      text: texto,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(botones?.length ? { reply_markup: { inline_keyboard: botones } } : {}),
    });
  }

  /** Cambia el texto y los botones de un mensaje ya enviado (p. ej. tras pulsar «Cobrada») */
  editar(chatId: number, mensajeId: number, texto: string, botones?: Botones) {
    return this.llamar('editMessageText', {
      chat_id: chatId,
      message_id: mensajeId,
      text: texto,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: botones ?? [] },
    });
  }

  /** Quita el «cargando» del botón pulsado, con un aviso corto opcional */
  responderBoton(id: string, texto?: string, alerta = false) {
    return this.llamar('answerCallbackQuery', { callback_query_id: id, text: texto, show_alert: alerta }).catch(() => undefined);
  }

  /** Manda el aviso a todos los chats conectados que lo tienen activado. Nunca lanza: un aviso no debe romper lo demás */
  async avisar(tipo: TipoAviso, texto: string, opciones: { botones?: Botones; excepto?: number } = {}) {
    if (!this.token) return 0;
    try {
      const chats = ok(await this.db.from('telegram_chats').select('chat_id').not('chat_id', 'is', null).contains('avisos', [tipo])) ?? [];
      const destino = chats.filter((c) => c.chat_id !== opciones.excepto);
      const resultados = await Promise.allSettled(destino.map((c) => this.enviar(c.chat_id, texto, opciones.botones)));
      resultados.forEach((r) => r.status === 'rejected' && this.log.error(`Aviso ${tipo} sin entregar: ${r.reason?.message}`));
      return resultados.filter((r) => r.status === 'fulfilled').length;
    } catch (e: any) {
      this.log.error(`No se ha podido mandar el aviso ${tipo}: ${e.message}`);
      return 0;
    }
  }

  /** Igual que avisar, pero solo una vez por clave (p. ej. «vencida:<id>») */
  async avisarUnaVez(clave: string, tipo: TipoAviso, texto: string, opciones: { botones?: Botones } = {}) {
    if (!this.token) return 0;
    const { error } = await this.db.from('avisos_enviados').insert({ clave });
    if (error) return 0; // ya se mandó
    return this.avisar(tipo, texto, opciones);
  }
}
