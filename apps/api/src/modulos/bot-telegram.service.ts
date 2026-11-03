import { Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { puedeAcceder } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { busqueda, ok } from '../comun/db';
import { cargarPerfil } from '../comun/perfil';
import { Botones, html, TelegramService } from '../comun/telegram.service';
import { AvisosTelegramService, diasEntre, doc, euros, fechaCorta, hoyMadrid } from './avisos-telegram.service';
import { FacturasService } from './facturas.service';
import { CobrosService } from './cobros.controller';
import { FacturarTelegramService, PREGUNTA_HORAS } from './facturar-telegram.service';
import { EnvioFacturaService } from './envio-factura.service';

const AYUDA = [
  '/menu · botones con todo lo que puedes hacer',
  '/facturar · facturar el mes y mandarlo a los clientes',
  '/resumen · lo que te deben',
  '/pendientes · facturas sin cobrar',
  '/facturas · todas las facturas, de la más nueva a la más antigua',
  '/semana · resumen de los últimos 7 días',
  '/cliente nombre · deuda y contacto de un cliente',
  '/factura 30 · ver una factura',
  '/proyecto nombre · hitos y facturación de un proyecto',
  '/renovaciones · hosting, dominios y mantenimientos que renuevan pronto',
  '/parar · dejar de recibir avisos',
].join('\n');

/** Preguntas a las que se contesta escribiendo (Telegram las marca como «responder») */
const PREGUNTA_CLIENTE = '🔍 Escribe el nombre del cliente:';
const PREGUNTA_PROYECTO = '🔍 Escribe el nombre del proyecto:';

const ESTADO_FACTURA: Record<string, string> = { borrador: 'Prefactura', emitida: 'Por cobrar', cobrada: 'Cobrada', anulada: 'Anulada' };
/** Facturas por mensaje en /facturas (Telegram corta los mensajes de más de 4.096 letras) */
const POR_PAGINA = 20;

const ESTADO_ENVIO: Record<string, string> = { enviado: 'enviado', entregado: '✅ entregado', retrasado: '⏳ retrasado', rebotado: '🔴 no ha llegado', spam: '🔴 marcado como spam' };

interface Quien {
  usuario_id: string;
  nombre: string | null;
  permisos: string[];
}

/**
 * Lo que hace el bot cuando le escriben o pulsan un botón. Actúa en nombre del
 * usuario que conectó el chat y con sus mismos permisos que en la app.
 */
@Injectable()
export class BotTelegramService {
  private readonly log = new Logger('BotTelegram');

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
    private readonly avisos: AvisosTelegramService,
    private readonly facturas: FacturasService,
    private readonly cobros: CobrosService,
    private readonly facturar: FacturarTelegramService,
    private readonly envio: EnvioFacturaService,
  ) {}

  /** Usuario conectado a este chat, con sus permisos (null si el chat no está conectado o ya no tiene acceso) */
  private async quien(chatId: number): Promise<Quien | null> {
    const chat = ok(await this.db.from('telegram_chats').select('usuario_id, nombre').eq('chat_id', chatId).maybeSingle());
    if (!chat) return null;
    const cargado = await cargarPerfil(this.db, chat.usuario_id);
    if (!cargado || cargado.perfil.tipo === 'trabajador') return null;
    return { usuario_id: chat.usuario_id, nombre: chat.nombre, permisos: cargado.perfil.permisos };
  }

  private puede(q: Quien, metodo: string, ruta: string) {
    return puedeAcceder(metodo, ruta, q.permisos);
  }

  private enlace(ruta: string, texto: string) {
    return `<a href="${this.telegram.web}${ruta}">${html(texto)}</a>`;
  }

  // ───────────────────────── Mensajes ─────────────────────────

  async mensaje(chatId: number, texto: string, de: any, respuesta?: any) {
    const respondeA: string | undefined = respuesta?.text;
    if (!texto.startsWith('/') && respondeA?.startsWith(PREGUNTA_HORAS)) {
      const q = await this.quien(chatId);
      if (!q) return;
      return this.facturar.contestarHoras(chatId, texto, respuesta, (m, r) => this.puede(q, m, r));
    }
    // Respuesta a «Escribe el nombre…»: se trata como la orden de buscar. Cualquier otro texto suelto enseña el menú
    if (!texto.startsWith('/')) {
      const orden = respondeA === PREGUNTA_CLIENTE ? '/cliente' : respondeA === PREGUNTA_PROYECTO ? '/proyecto' : '/menu';
      texto = orden === '/menu' ? orden : `${orden} ${texto}`;
    }
    const [orden, ...resto] = texto.split(/\s+/);
    const comando = orden.replace(/@.*/, '').toLowerCase();
    const argumento = resto.join(' ').trim();

    if (comando === '/start' && argumento) return this.conectar(chatId, argumento, de);

    const q = await this.quien(chatId);
    if (!q) {
      // Un trabajador conectado no usa el bot, pero sí la app: le abre su portal
      const conectado = ok(await this.db.from('telegram_chats').select('usuario_id').eq('chat_id', chatId).maybeSingle());
      if (conectado) return this.telegram.enviar(chatId, 'Hola 👋 Pulsa «Abrir app» para ver tu proyecto, tus documentos y tus nóminas.', [[this.telegram.abrir('📱 Abrir app', '/')]]);
      return this.telegram.enviar(chatId, 'Hola 👋 Para usar este bot, pide a la oficina tu enlace de conexión o entra en la app → Mi empresa → «Conectar Telegram».');
    }
    switch (comando) {
      case '/start':
      case '/menu':
        return this.menu(chatId, q);
      case '/facturar':
        if (!this.puede(q, 'POST', '/facturas/facturar-mes')) return this.telegram.enviar(chatId, 'No tienes permiso para facturar.');
        return this.facturar.elegirMes(chatId);
      case '/resumen':
        return this.telegram.enviar(chatId, await this.avisos.textoResumen(), [[this.telegram.abrir('Abrir cobros', '/cobros')]]);
      case '/pendientes':
        return this.telegram.enviar(chatId, await this.avisos.textoPendientes(), [[this.telegram.abrir('Abrir facturas', '/facturas?estado=emitida')]]);
      case '/semana':
        return this.telegram.enviar(chatId, await this.avisos.textoSemanal());
      case '/cliente':
        return this.buscarCliente(chatId, q, argumento);
      case '/factura':
        return this.verFactura(chatId, q, argumento);
      case '/facturas':
        return this.listarFacturas(chatId, q, 0);
      case '/proyecto':
        return this.buscarProyecto(chatId, q, argumento);
      case '/renovaciones':
        return this.renovaciones(chatId, q);
      case '/parar':
        ok(await this.db.from('telegram_chats').delete().eq('chat_id', chatId));
        return this.telegram.enviar(chatId, 'Hecho, ya no te llegarán avisos. Puedes volver a conectarte desde la app cuando quieras.');
      default:
        return this.telegram.enviar(chatId, AYUDA, [[{ text: '📋 Ver el menú', callback_data: 'm:menu' }], [this.telegram.abrir('📱 Abrir la app', '/')]]);
    }
  }

  /** Botones con todo lo que se puede hacer, según los permisos de cada uno */
  private menu(chatId: number, q: Quien) {
    const filas: Botones = [];
    if (this.puede(q, 'POST', '/facturas/facturar-mes')) filas.push([{ text: '🧾 Facturar el mes', callback_data: 'm:facturar' }]);
    if (this.puede(q, 'GET', '/cobros')) {
      filas.push([{ text: '📊 Resumen', callback_data: 'm:resumen' }, { text: '🧾 Sin cobrar', callback_data: 'm:pendientes' }]);
      filas.push([{ text: '📅 Última semana', callback_data: 'm:semana' }]);
    }
    if (this.puede(q, 'GET', '/facturas')) filas.push([{ text: '📄 Todas las facturas', callback_data: 'lf:0' }]);
    const buscar = [];
    if (this.puede(q, 'GET', '/clientes')) buscar.push({ text: '🔍 Cliente', callback_data: 'm:cliente' });
    if (this.puede(q, 'GET', '/proyectos')) buscar.push({ text: '🔍 Proyecto', callback_data: 'm:proyecto' });
    if (buscar.length) filas.push(buscar);
    if (this.puede(q, 'GET', '/servicios')) filas.push([{ text: '🔁 Renovaciones', callback_data: 'm:renovaciones' }]);
    filas.push([this.telegram.abrir('📱 Abrir la app', '/')]);
    return this.telegram.enviar(chatId, '📋 <b>¿Qué quieres ver?</b>', filas);
  }

  /** Pide un nombre: la respuesta llega como mensaje que «responde» a esta pregunta */
  private preguntar(chatId: number, pregunta: string) {
    return this.telegram.llamar('sendMessage', { chat_id: chatId, text: pregunta, reply_markup: { force_reply: true, input_field_placeholder: 'Nombre…' } });
  }

  private async conectar(chatId: number, codigo: string, de: any) {
    const fila = ok(await this.db.from('telegram_chats').select('usuario_id, codigo_caduca').eq('codigo', codigo).maybeSingle());
    if (!fila || Date.parse(fila.codigo_caduca) < Date.now()) {
      return this.telegram.enviar(chatId, 'Este enlace ya no vale: ya se usó o ha caducado. Pide uno nuevo a la oficina, o en la app pulsa Mi empresa → «Conectar Telegram».');
    }
    // Un chat solo puede estar conectado a un usuario
    ok(await this.db.from('telegram_chats').delete().eq('chat_id', chatId).neq('usuario_id', fila.usuario_id));
    const nombre = [de?.first_name, de?.last_name].filter(Boolean).join(' ') || de?.username || null;
    ok(
      await this.db
        .from('telegram_chats')
        .update({ chat_id: chatId, nombre, codigo: null, codigo_caduca: null, vinculado_en: new Date().toISOString() })
        .eq('usuario_id', fila.usuario_id),
    );
    const perfil = await cargarPerfil(this.db, fila.usuario_id);
    if (perfil?.perfil.tipo === 'trabajador') {
      return this.telegram.enviar(chatId, `✅ <b>Conectado${nombre ? `, ${html(nombre)}` : ''}</b>\n\nCon «Abrir app» tienes tu proyecto, tus documentos y tus nóminas, sin contraseña.`, [
        [this.telegram.abrir('📱 Abrir app', '/')],
      ]);
    }
    return this.telegram.enviar(
      chatId,
      `✅ <b>Conectado${nombre ? `, ${html(nombre)}` : ''}</b>\n\nTe avisaré aquí de correos que no lleguen, cobros, facturas vencidas, fin de mes y un resumen los lunes. Puedes elegir cuáles en la app, en Mi empresa.\n\nCon /menu tienes botones para todo, y con «Abrir app», la aplicación entera dentro de Telegram.`,
      [[{ text: '📋 Ver el menú', callback_data: 'm:menu' }], [this.telegram.abrir('📱 Abrir la app', '/')]],
    );
  }

  private async buscarCliente(chatId: number, q: Quien, texto: string) {
    if (!this.puede(q, 'GET', '/clientes')) return this.telegram.enviar(chatId, 'No tienes permiso para ver clientes.');
    if (!texto) return this.telegram.enviar(chatId, 'Escribe parte del nombre, por ejemplo: /cliente reynalco');
    const clientes = (ok(await this.db.from('clientes').select('id, nombre').ilike('nombre', `%${busqueda(texto)}%`).order('nombre').limit(8)) ?? []) as any[];
    if (!clientes.length) return this.telegram.enviar(chatId, `No hay ningún cliente que se llame «${html(texto)}».`);
    if (clientes.length > 1) {
      return this.telegram.enviar(chatId, `Hay ${clientes.length} clientes con «${html(texto)}». ¿Cuál?`, clientes.map((c) => [{ text: c.nombre, callback_data: `cl:${c.id}` }]));
    }
    return this.fichaCliente(chatId, q, clientes[0].id);
  }

  private async fichaCliente(chatId: number, q: Quien, id: string) {
    const c = ok(await this.db.from('clientes').select('id, nombre, cif, email, telefono, contacto').eq('id', id).single()) as any;
    const lineas = [`👤 <b>${html(c.nombre)}</b>`];
    if (c.cif) lineas.push(`CIF ${html(c.cif)}`);
    if (c.contacto) lineas.push(`Contacto: ${html(c.contacto)}`);
    if (c.telefono) lineas.push(`📞 ${html(c.telefono)}`);
    if (c.email) lineas.push(`✉️ ${html(c.email)}`);
    if (this.puede(q, 'GET', '/facturas')) {
      const hoy = hoyMadrid();
      const pendientes = (ok(await this.db.from('facturas').select('id, numero, total, vencimiento').eq('cliente_id', id).eq('estado', 'emitida').order('vencimiento')) ?? []) as any[];
      const vencidas = pendientes.filter((f) => f.vencimiento && f.vencimiento < hoy);
      const suma = (l: any[]) => l.reduce((s, f) => s + Number(f.total), 0);
      lineas.push('');
      if (!pendientes.length) lineas.push('✅ No te debe nada.');
      else {
        lineas.push(`Te debe <b>${euros(suma(pendientes))}</b> en ${pendientes.length === 1 ? '1 factura' : `${pendientes.length} facturas`}.`);
        if (vencidas.length) lineas.push(`🔴 Vencido: ${euros(suma(vencidas))}`);
        for (const f of pendientes.slice(0, 6)) {
          const vencida = f.vencimiento && f.vencimiento < hoy;
          lineas.push(`${vencida ? '🔴' : '⚪️'} ${this.enlace(`/facturas/${f.id}`, doc(f))}: ${euros(Number(f.total))}${f.vencimiento ? ` · ${vencida ? 'venció' : 'vence'} el ${fechaCorta(f.vencimiento)}` : ''}`);
        }
      }
    }
    return this.telegram.enviar(chatId, lineas.join('\n'), [[this.telegram.abrir('Abrir cliente', `/clientes/${id}`)]]);
  }

  private async verFactura(chatId: number, q: Quien, numero: string) {
    if (!this.puede(q, 'GET', '/facturas')) return this.telegram.enviar(chatId, 'No tienes permiso para ver facturas.');
    if (!numero) return this.telegram.enviar(chatId, 'Escribe el número, por ejemplo: /factura 30');
    const f = ok(await this.db.from('facturas').select('id').eq('numero', numero.replace(/^n?º?\s*/i, '')).maybeSingle());
    if (!f) return this.telegram.enviar(chatId, `No encuentro la factura ${html(numero)}.`);
    return this.fichaFactura(chatId, q, f.id);
  }

  /**
   * Todas las facturas emitidas (sin prefacturas), de la más nueva a la más antigua, por páginas.
   * Con `mensajeId` se cambia de página en el mismo mensaje en lugar de mandar otro.
   */
  private async listarFacturas(chatId: number, q: Quien, desde: number, mensajeId?: number): Promise<unknown> {
    if (!this.puede(q, 'GET', '/facturas')) return this.telegram.enviar(chatId, 'No tienes permiso para ver facturas.');
    const { data, count, error } = await this.db
      .from('facturas')
      .select('id, numero, fecha, vencimiento, total, estado, cliente:clientes(nombre)', { count: 'exact' })
      .neq('estado', 'borrador')
      .order('fecha', { ascending: false, nullsFirst: false })
      .order('numero', { ascending: false })
      .range(desde, desde + POR_PAGINA - 1);
    // Si se han borrado facturas desde que se pidió la página, se vuelve a la primera
    if (error?.code === 'PGRST103' && desde > 0) return this.listarFacturas(chatId, q, 0, mensajeId);
    if (error) throw new Error(error.message);
    const facturas = (data ?? []) as any[];
    const total = count ?? 0;
    if (!total) return this.telegram.enviar(chatId, 'Aún no hay ninguna factura emitida.');

    const hoy = hoyMadrid();
    const icono = (f: any) =>
      f.estado === 'cobrada' ? '✅' : f.estado === 'anulada' ? '✖️' : f.vencimiento && f.vencimiento < hoy ? '🔴' : '⚪️';
    const lineas = [
      `📄 <b>Facturas</b> · ${desde + 1}–${desde + facturas.length} de ${total}`,
      '',
      ...facturas.map(
        (f) => `${icono(f)} ${this.enlace(`/facturas/${f.id}`, doc(f))} · ${html(f.cliente?.nombre ?? 'Sin cliente')} · ${euros(Number(f.total))}${f.fecha ? ` · ${fechaCorta(f.fecha)}` : ''}`,
      ),
      '',
      '✅ cobrada · ⚪️ por cobrar · 🔴 vencida · ✖️ anulada',
      'Pulsa 📥 para recibir el PDF aquí.',
    ];
    // Un botón por factura para recibir su PDF aquí mismo, de 4 en 4
    const descargas: Botones = [];
    for (let i = 0; i < facturas.length; i += 4) {
      descargas.push(facturas.slice(i, i + 4).map((f) => ({ text: `📥 ${f.numero ?? 'PDF'}`, callback_data: `pdf:${f.id}` })));
    }
    const paginas = [];
    if (desde > 0) paginas.push({ text: '⬅️ Más nuevas', callback_data: `lf:${Math.max(0, desde - POR_PAGINA)}` });
    if (desde + POR_PAGINA < total) paginas.push({ text: 'Más antiguas ➡️', callback_data: `lf:${desde + POR_PAGINA}` });
    const botones: Botones = [...descargas, ...(paginas.length ? [paginas] : []), [this.telegram.abrir('Abrir facturas', '/facturas')]];
    return mensajeId ? this.telegram.editar(chatId, mensajeId, lineas.join('\n'), botones) : this.telegram.enviar(chatId, lineas.join('\n'), botones);
  }

  private async textoFactura(id: string) {
    const f = ok(
      await this.db
        .from('facturas')
        .select('id, numero, fecha, vencimiento, total, estado, cobrada_en, rectifica_id, cliente:clientes(nombre, email), proyecto:proyectos(nombre), envios(estado, para, enviado_en, modo)')
        .eq('id', id)
        .single(),
    ) as any;
    const hoy = hoyMadrid();
    const vencida = f.estado === 'emitida' && f.vencimiento && f.vencimiento < hoy;
    const lineas = [
      `🧾 <b>${doc(f)}</b> · ${html(f.cliente?.nombre)}`,
      f.proyecto?.nombre ? `Proyecto: ${html(f.proyecto.nombre)}` : '',
      `Total: <b>${euros(Number(f.total))}</b>`,
      `Estado: ${ESTADO_FACTURA[f.estado] ?? f.estado}${f.estado === 'cobrada' && f.cobrada_en ? ` el ${fechaCorta(f.cobrada_en)}` : ''}`,
      f.fecha ? `Fecha: ${fechaCorta(f.fecha)}` : '',
      f.vencimiento ? `${vencida ? '🔴 Venció' : 'Vence'} el ${fechaCorta(f.vencimiento)}${vencida ? ` (hace ${diasEntre(f.vencimiento, hoy)} días)` : ''}` : '',
    ];
    const ultimo = [...(f.envios ?? [])].filter((e: any) => e.modo !== 'prueba').sort((a: any, b: any) => b.enviado_en.localeCompare(a.enviado_en))[0];
    lineas.push(ultimo ? `Último correo: ${ESTADO_ENVIO[ultimo.estado] ?? ultimo.estado} · ${fechaCorta(ultimo.enviado_en.slice(0, 10))}` : 'Aún no se ha enviado por correo');
    return { f, texto: lineas.filter(Boolean).join('\n') };
  }

  private botonesFactura(q: Quien, f: any): Botones {
    const filas: Botones = [];
    if (f.estado === 'emitida') {
      const fila = [];
      if (this.puede(q, 'PATCH', `/facturas/${f.id}/estado`)) fila.push({ text: '✅ Cobrada', callback_data: `c:${f.id}` });
      if (!f.rectifica_id && f.cliente?.email && this.puede(q, 'POST', '/cobros/recordatorio')) fila.push({ text: '📧 Recordatorio', callback_data: `r:${f.id}` });
      if (fila.length) filas.push(fila);
    }
    filas.push([{ text: '📥 PDF', callback_data: `pdf:${f.id}` }, this.telegram.abrir('Abrir factura', `/facturas/${f.id}`)]);
    return filas;
  }

  private async fichaFactura(chatId: number, q: Quien, id: string) {
    const { f, texto } = await this.textoFactura(id);
    return this.telegram.enviar(chatId, texto, this.botonesFactura(q, f));
  }

  private async buscarProyecto(chatId: number, q: Quien, texto: string) {
    if (!this.puede(q, 'GET', '/proyectos')) return this.telegram.enviar(chatId, 'No tienes permiso para ver proyectos.');
    if (!texto) return this.telegram.enviar(chatId, 'Escribe parte del nombre, por ejemplo: /proyecto tienda');
    const proyectos = (ok(await this.db.from('proyectos').select('id, nombre').ilike('nombre', `%${busqueda(texto)}%`).order('nombre').limit(8)) ?? []) as any[];
    if (!proyectos.length) return this.telegram.enviar(chatId, `No hay ningún proyecto que se llame «${html(texto)}».`);
    if (proyectos.length > 1) {
      return this.telegram.enviar(chatId, `Hay ${proyectos.length} proyectos con «${html(texto)}». ¿Cuál?`, proyectos.map((o) => [{ text: o.nombre, callback_data: `ob:${o.id}` }]));
    }
    return this.fichaProyecto(chatId, q, proyectos[0].id);
  }

  private async fichaProyecto(chatId: number, q: Quien, id: string) {
    const [proyecto, facturas] = await Promise.all([
      this.db.from('proyectos').select('id, nombre, estado, modalidad, presupuesto, cliente:clientes(nombre), hitos(nombre, importe, completado_en, factura_id, orden)').eq('id', id).single().then((r) => ok(r) as any),
      this.puede(q, 'GET', '/facturas')
        ? this.db.from('facturas').select('base, periodo, estado').eq('proyecto_id', id).in('estado', ['emitida', 'cobrada']).is('rectifica_id', null).order('fecha', { ascending: false }).then((r) => (ok(r) ?? []) as any[])
        : Promise.resolve(null),
    ]);
    const estado: Record<string, string> = { activo: 'en marcha', pausado: 'pausado', terminado: 'terminado' };
    const lineas = [
      `🚀 <b>${html(proyecto.nombre)}</b>`,
      proyecto.cliente?.nombre ? `Cliente: ${html(proyecto.cliente.nombre)}` : '',
      `Estado: ${estado[proyecto.estado] ?? html(proyecto.estado)} · ${proyecto.modalidad === 'horas' ? 'por horas' : `por hitos (${euros(Number(proyecto.presupuesto))})`}`,
    ];
    if (facturas) {
      const total = facturas.reduce((s, f) => s + Number(f.base), 0);
      lineas.push('', `Facturado: <b>${euros(total)}</b> (sin IVA) en ${facturas.length === 1 ? '1 factura' : `${facturas.length} facturas`}`);
    }
    const hitos = [...(proyecto.hitos ?? [])].sort((a: any, b: any) => a.orden - b.orden);
    if (hitos.length) {
      lineas.push('', `🎯 Hitos (${hitos.filter((h: any) => h.completado_en).length} de ${hitos.length} entregados):`);
      lineas.push(...hitos.slice(0, 10).map((h: any) => `${h.factura_id ? '💶' : h.completado_en ? '✅' : '⏳'} ${html(h.nombre)} · ${euros(Number(h.importe))}`));
    }
    return this.telegram.enviar(chatId, lineas.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n'), [[this.telegram.abrir('Abrir proyecto', `/proyectos/${id}`)]]);
  }

  /** Servicios que renuevan en los próximos 30 días (y los que ya pasaron sin facturar) */
  private async renovaciones(chatId: number, q: Quien) {
    if (!this.puede(q, 'GET', '/servicios')) return this.telegram.enviar(chatId, 'No tienes permiso para ver los servicios.');
    const hoy = hoyMadrid();
    const en30 = new Date(Date.parse(`${hoy}T12:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10);
    const lista = (ok(
      await this.db
        .from('servicios')
        .select('id, nombre, detalle, precio, proxima_renovacion, cliente:clientes(nombre)')
        .eq('estado', 'activo')
        .lte('proxima_renovacion', en30)
        .order('proxima_renovacion')
        .limit(20),
    ) ?? []) as any[];
    if (!lista.length) return this.telegram.enviar(chatId, '🔁 No hay renovaciones en los próximos 30 días.');
    const lineas = lista.map((s) => {
      const cuando = new Date(`${s.proxima_renovacion}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      return `${s.proxima_renovacion < hoy ? '⚠️' : '🔁'} ${cuando} · ${html(s.nombre)}${s.detalle ? ` (${html(s.detalle)})` : ''} · ${html(s.cliente?.nombre)} · ${euros(Number(s.precio))}`;
    });
    return this.telegram.enviar(chatId, [`🔁 <b>Renovaciones en los próximos 30 días</b>`, '', ...lineas].join('\n'), [[this.telegram.abrir('Abrir servicios', '/servicios')]]);
  }

  // ───────────────────────── Botones ─────────────────────────

  async boton(cb: any) {
    const chatId: number | undefined = cb.message?.chat?.id;
    const mensajeId: number | undefined = cb.message?.message_id;
    const [accion, id] = String(cb.data ?? '').split(':');
    if (!chatId || !mensajeId || !id) return this.telegram.responderBoton(cb.id);
    const q = await this.quien(chatId);
    if (!q) return this.telegram.responderBoton(cb.id, 'Este chat ya no está conectado a la app', true);
    const sinPermiso = () => this.telegram.responderBoton(cb.id, 'No tienes permiso para esto', true);
    const original = String(cb.message?.text ?? '');
    const quien = q.nombre ?? 'alguien';

    try {
      if (/^f/i.test(accion)) {
        const r = await this.facturar.boton(accion, id, chatId, mensajeId, quien, (m, ruta) => this.puede(q, m, ruta), (t, alerta) => this.telegram.responderBoton(cb.id, t, alerta));
        if (r !== false) return r;
      }
      switch (accion) {
        case 'm': {
          await this.telegram.responderBoton(cb.id);
          if (id === 'menu') return this.menu(chatId, q);
          if (id === 'facturar') return this.puede(q, 'POST', '/facturas/facturar-mes') ? this.facturar.elegirMes(chatId) : sinPermiso();
          if (id === 'resumen') return this.telegram.enviar(chatId, await this.avisos.textoResumen(), [[this.telegram.abrir('Abrir cobros', '/cobros')]]);
          if (id === 'pendientes') return this.telegram.enviar(chatId, await this.avisos.textoPendientes(), [[this.telegram.abrir('Abrir facturas', '/facturas?estado=emitida')]]);
          if (id === 'semana') return this.telegram.enviar(chatId, await this.avisos.textoSemanal());
          if (id === 'cliente') return this.preguntar(chatId, PREGUNTA_CLIENTE);
          if (id === 'proyecto') return this.preguntar(chatId, PREGUNTA_PROYECTO);
          if (id === 'renovaciones') return this.renovaciones(chatId, q);
          return;
        }

        case 'lf':
          await this.telegram.responderBoton(cb.id);
          // Desde el menú se manda una lista nueva; las flechas cambian de página en el mismo mensaje
          return this.listarFacturas(chatId, q, Number(id) || 0, original.startsWith('📄 Facturas') ? mensajeId : undefined);

        // El PDF de la factura, al chat (el mismo que se adjunta al correo)
        case 'pdf': {
          if (!this.puede(q, 'GET', '/facturas')) return sinPermiso();
          await this.telegram.responderBoton(cb.id, '📥 Preparando el PDF…');
          await this.telegram.llamar('sendChatAction', { chat_id: chatId, action: 'upload_document' }).catch(() => undefined);
          const { pdf, nombre } = await this.envio.pdf(id);
          return this.telegram.enviarArchivo(chatId, pdf, nombre);
        }

        case 'cl':
          await this.telegram.responderBoton(cb.id);
          return this.fichaCliente(chatId, q, id);
        case 'ob':
          await this.telegram.responderBoton(cb.id);
          return this.fichaProyecto(chatId, q, id);

        case 'c': {
          if (!this.puede(q, 'PATCH', `/facturas/${id}/estado`)) return sinPermiso();
          const f = ok(await this.db.from('facturas').select('estado').eq('id', id).single()) as any;
          if (f.estado !== 'emitida') return this.telegram.responderBoton(cb.id, f.estado === 'cobrada' ? 'Ya estaba cobrada' : 'Esta factura ya no está por cobrar', true);
          await this.facturas.cambiarEstado(id, 'cobrada', { quien, exceptoChat: chatId });
          await this.telegram.responderBoton(cb.id, '✅ Marcada como cobrada');
          return this.telegram.editar(chatId, mensajeId, `${html(original)}\n\n✅ <b>Cobrada</b> · la ha marcado ${html(quien)}`, [
            [{ text: '↩️ Deshacer', callback_data: `d:${id}` }],
            [this.telegram.abrir('Abrir factura', `/facturas/${id}`)],
          ]);
        }

        case 'd': {
          if (!this.puede(q, 'PATCH', `/facturas/${id}/estado`)) return sinPermiso();
          const f = ok(await this.db.from('facturas').select('estado').eq('id', id).single()) as any;
          if (f.estado !== 'cobrada') return this.telegram.responderBoton(cb.id, 'Ya no está marcada como cobrada', true);
          await this.facturas.cambiarEstado(id, 'emitida');
          await this.telegram.responderBoton(cb.id, '↩️ Vuelve a estar por cobrar');
          const limpio = original.replace(/\n\n✅ Cobrada · .*$/s, '');
          return this.telegram.editar(chatId, mensajeId, `${html(limpio)}\n\n↩️ <b>Deshecho</b> · vuelve a estar por cobrar (${html(quien)})`, [
            [{ text: '✅ Cobrada', callback_data: `c:${id}` }],
            [this.telegram.abrir('Abrir factura', `/facturas/${id}`)],
          ]);
        }

        // Primer toque: pregunta antes de escribir al cliente
        case 'r': {
          if (!this.puede(q, 'POST', '/cobros/recordatorio')) return sinPermiso();
          const f = ok(await this.db.from('facturas').select('cliente:clientes(email)').eq('id', id).single()) as any;
          if (!f.cliente?.email) return this.telegram.responderBoton(cb.id, 'Este cliente no tiene correo. Añádelo en la app.', true);
          await this.telegram.responderBoton(cb.id);
          return this.telegram.editar(chatId, mensajeId, `${html(original)}\n\n📧 ¿Mandar el recordatorio de pago a <b>${html(f.cliente.email)}</b>?`, [
            [{ text: '📧 Sí, mandarlo', callback_data: `R:${id}` }, { text: 'Cancelar', callback_data: `x:${id}` }],
          ]);
        }

        case 'R': {
          if (!this.puede(q, 'POST', '/cobros/recordatorio')) return sinPermiso();
          const f = ok(
            await this.db.from('facturas').select('id, numero, total, vencimiento, estado, cliente:clientes(nombre, email, contacto)').eq('id', id).single(),
          ) as any;
          if (f.estado !== 'emitida') return this.telegram.responderBoton(cb.id, 'Esta factura ya no está por cobrar', true);
          await this.cobros.enviarRecordatorio(f, f.cliente.email, await this.cobros.textoRecordatorio(f));
          await this.telegram.responderBoton(cb.id, '📧 Recordatorio enviado');
          const limpio = original.replace(/\n\n📧 ¿Mandar.*$/s, '');
          return this.telegram.editar(chatId, mensajeId, `${html(limpio)}\n\n📧 <b>Recordatorio enviado</b> a ${html(f.cliente.email)} (${html(quien)})`, [
            [{ text: '✅ Cobrada', callback_data: `c:${id}` }],
            [this.telegram.abrir('Abrir factura', `/facturas/${id}`)],
          ]);
        }

        case 'x': {
          await this.telegram.responderBoton(cb.id, 'Cancelado');
          const limpio = original.replace(/\n\n📧 ¿Mandar.*$/s, '');
          return this.telegram.editar(chatId, mensajeId, html(limpio), [
            [{ text: '✅ Cobrada', callback_data: `c:${id}` }, { text: '📧 Mandar recordatorio', callback_data: `r:${id}` }],
            [this.telegram.abrir('Abrir factura', `/facturas/${id}`)],
          ]);
        }

        // Correo rebotado dado por revisado (id = envío)
        case 'v': {
          if (!this.puede(q, 'PATCH', `/cobros/envios/${id}/revisado`)) return sinPermiso();
          const envio = ok(await this.db.from('envios').update({ revisado: true }).eq('id', id).select('factura_id').single()) as any;
          await this.telegram.responderBoton(cb.id, 'Hecho');
          return this.telegram.editar(chatId, mensajeId, `${html(original)}\n\n👍 <b>Revisado</b> por ${html(quien)}`, [
            [this.telegram.abrir('Abrir factura', `/facturas/${envio.factura_id}`)],
          ]);
        }
      }
      return this.telegram.responderBoton(cb.id);
    } catch (e: any) {
      this.log.error(`Botón ${accion} de ${id}: ${e.message}`);
      return this.telegram.responderBoton(cb.id, e.message ?? 'Algo ha fallado. Prueba desde la app.', true);
    }
  }
}
