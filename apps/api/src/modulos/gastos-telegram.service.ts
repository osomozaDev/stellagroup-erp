import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { aPartesIguales, CATEGORIAS_GASTO, gastoSchema, nombreCategoriaGasto } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { busqueda, ok } from '../comun/db';
import { Botones, html, TelegramService } from '../comun/telegram.service';
import { euros, fechaCorta, hoyMadrid } from './avisos-telegram.service';
import { GastosController } from './gastos.controller';

/** Preguntas a las que se contesta escribiendo */
export const PREGUNTA_GASTO = '🧾 Nuevo gasto.';
const PREGUNTA_CLIENTE_GASTO = '🔍 Cliente para el gasto #';
export const PREGUNTAS_GASTO = [PREGUNTA_GASTO, PREGUNTA_CLIENTE_GASTO];

/** Botones de este servicio (callback_data «accion:id[:extra]», máximo 64 bytes) */
const ACCIONES = new Set(['gm', 'gn', 'gv', 'gl', 'gk', 'gt', 'gq', 'gb', 'GB']);
const CLIENTES_POR_PAGINA = 8;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const LETRA_CATEGORIA: Record<string, string> = { material: 'm', suscripcion: 's', horas: 'h', otro: 'o' };
const CATEGORIA_DE_LETRA = Object.fromEntries(Object.entries(LETRA_CATEGORIA).map(([c, l]) => [l, c]));

type Puede = (metodo: string, ruta: string) => boolean;
type Responder = (texto?: string, alerta?: boolean) => Promise<unknown>;

/** Un uuid en 22 letras (base64url) para que quepan dos en un botón */
export const corto = (uuid: string) => Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url');
export const largo = (c: string) => {
  const h = Buffer.from(c, 'base64url').toString('hex');
  return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : '';
};

const nombreDeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const moverMes = (mes: string, d: number) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + d, 1)).toISOString().slice(0, 7);
const finDeMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);

/**
 * «Plásticos QR 120», «120 € plásticos QR» o «licencia Figma 14,52€» → concepto e importe.
 * Si hay una cantidad con € se usa esa; si no, el último número. Sin importe, null.
 */
export function gastoDeTexto(texto: string): { concepto: string; importe: number } | null {
  const limpio = texto.trim().replace(/\s+/g, ' ');
  const numeros = [...limpio.matchAll(/(?<![\w.,])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(€|euros?\b|eur\b)?/gi)];
  if (!numeros.length) return null;
  const elegido = numeros.find((m) => m[2]) ?? numeros[numeros.length - 1];
  let n = elegido[1];
  n = /\.\d{3}/.test(n) && (n.includes(',') || n.split('.').length > 2 || /\.\d{3}$/.test(n)) ? n.replace(/\./g, '').replace(',', '.') : n.replace(',', '.');
  const importe = Math.round(Number(n) * 100) / 100;
  if (!(importe > 0)) return null;
  const concepto = (limpio.slice(0, elegido.index) + ' ' + limpio.slice(elegido.index! + elegido[0].length))
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;·-]+|[\s,.:;·-]+$/g, '')
    .replace(/\s+(?:de|por|a)$/i, '')
    .trim();
  if (!concepto) return null;
  return { concepto: concepto.charAt(0).toUpperCase() + concepto.slice(1), importe };
}

/**
 * Gastos desde Telegram: resumen del mes, apuntar un gasto escribiendo «concepto importe» y,
 * con botones, elegir de qué clientes es (a partes iguales) y su tipo. Los porcentajes a
 * medida se ponen en la app.
 */
@Injectable()
export class GastosTelegramService {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
    private readonly gastos: GastosController,
  ) {}

  esSuya(accion: string) {
    return ACCIONES.has(accion);
  }

  private preguntar(chatId: number, texto: string, ejemplo: string) {
    return this.telegram.llamar('sendMessage', { chat_id: chatId, text: texto, reply_markup: { force_reply: true, input_field_placeholder: ejemplo } });
  }

  pedirGasto(chatId: number, aviso = '') {
    return this.preguntar(chatId, `${aviso}${PREGUNTA_GASTO} Escribe el concepto y el importe sin IVA, p. ej. «Plásticos QR 120» o «Licencia Figma 14,52 €»:`, 'Concepto e importe…');
  }

  // ───────────────────────── Resumen del mes ─────────────────────────

  async resumen(chatId: number, puede: Puede, mes = hoyMadrid().slice(0, 7), mensajeId?: number) {
    if (!puede('GET', '/gastos')) return this.telegram.enviar(chatId, 'No tienes permiso para ver los gastos.');
    const r = (await this.gastos.listar(`${mes}-01`, finDeMes(mes))) as any;
    const lineas = [`🧾 <b>Gastos de ${nombreDeMes(mes)}</b>`, ''];
    if (!r.gastos.length) lineas.push('No hay gastos apuntados este mes.');
    else {
      lineas.push(`Gastado: <b>${euros(r.total)}</b> en ${r.gastos.length === 1 ? '1 gasto' : `${r.gastos.length} gastos`} (sin IVA)`);
      if (r.sin_asignar > 0) lineas.push(`Sin cliente: ${euros(r.sin_asignar)}`);
      if (r.por_cliente.length) {
        lineas.push('', '<b>Por cliente</b>');
        for (const c of r.por_cliente.slice(0, 12)) lineas.push(`• ${html(c.nombre)}: ${euros(c.importe)}`);
        if (r.por_cliente.length > 12) lineas.push(`y ${r.por_cliente.length - 12} más`);
      }
      lineas.push('', '<b>Últimos</b>');
      for (const g of r.gastos.slice(0, 10)) {
        const quien = g.reparto.length ? g.reparto.map((x: any) => html(x.cliente?.nombre ?? '—')).join(', ') : 'sin cliente';
        lineas.push(`• ${fechaCorta(g.fecha)} · ${html(g.concepto)} · ${euros(Number(g.importe))} → ${quien}`);
      }
      if (r.gastos.length > 10) lineas.push(`y ${r.gastos.length - 10} más en la app`);
    }
    const botones: Botones = [[
      { text: `◀️ ${MESES[Number(moverMes(mes, -1).slice(5)) - 1]}`, callback_data: `gm:${moverMes(mes, -1)}` },
      { text: `${MESES[Number(moverMes(mes, 1).slice(5)) - 1]} ▶️`, callback_data: `gm:${moverMes(mes, 1)}` },
    ]];
    if (puede('POST', '/gastos')) botones.push([{ text: '➕ Apuntar gasto', callback_data: 'gn:1' }]);
    if (puede('PUT', '/gastos/x')) for (const g of r.gastos.slice(0, 6)) botones.push([{ text: `✏️ ${g.concepto.slice(0, 30)} · ${euros(Number(g.importe))}`, callback_data: `gv:${corto(g.id)}` }]);
    botones.push([this.telegram.abrir('📱 Abrir gastos en la app', '/gastos')]);
    return mensajeId ? this.telegram.editar(chatId, mensajeId, lineas.join('\n'), botones) : this.telegram.enviar(chatId, lineas.join('\n'), botones);
  }

  // ───────────────────────── Apuntar ─────────────────────────

  /** Respuesta a una de las preguntas: el gasto nuevo o el nombre del cliente a buscar */
  async contestar(chatId: number, texto: string, pregunta: string, puede: Puede, usuarioId: string) {
    if (pregunta.startsWith(PREGUNTA_CLIENTE_GASTO)) {
      const id = largo(pregunta.slice(PREGUNTA_CLIENTE_GASTO.length).split(/[\s:]/)[0]);
      return this.buscarCliente(chatId, id, texto, puede);
    }
    return this.crear(chatId, texto, puede, usuarioId);
  }

  async crear(chatId: number, texto: string, puede: Puede, usuarioId: string) {
    if (!puede('POST', '/gastos')) return this.telegram.enviar(chatId, 'No tienes permiso para apuntar gastos.');
    const leido = gastoDeTexto(texto);
    if (!leido) return this.pedirGasto(chatId, '⚠️ No veo el concepto y el importe. ');
    const g = (await this.gastos.crear(gastoSchema.parse({ fecha: hoyMadrid(), concepto: leido.concepto.slice(0, 160), importe: leido.importe, reparto: [] }), { user: { id: usuarioId } })) as any;
    // Directo a elegir clientes, que es lo siguiente que hay que hacer
    const v = await this.elegirClientes(g.id, 0, '✅ Gasto apuntado. ¿De qué clientes es? Se reparte a partes iguales.');
    return this.telegram.enviar(chatId, v.texto, v.botones);
  }

  // ───────────────────────── Tarjeta del gasto ─────────────────────────

  private async gasto(id: string) {
    return ok(await this.db.from('gastos').select('*, reparto:gasto_reparto(cliente_id, porcentaje, cliente:clientes(nombre))').eq('id', id).maybeSingle()) as any;
  }

  private cabecera(g: any) {
    const lineas = [`🧾 <b>${html(g.concepto)}</b>`, `${euros(Number(g.importe))} sin IVA · ${nombreCategoriaGasto(g.categoria)} · ${fechaCorta(g.fecha)}${g.proveedor ? ` · ${html(g.proveedor)}` : ''}`, ''];
    if (!g.reparto.length) lineas.push('Sin cliente: gasto general de la empresa.');
    else {
      const total = Number(g.importe);
      let resto = Math.round(total * 100);
      const orden = [...g.reparto].sort((a: any, b: any) => Number(b.porcentaje) - Number(a.porcentaje));
      orden.forEach((x: any, i: number) => {
        const centimos = i === orden.length - 1 ? resto : Math.round((total * 100 * Number(x.porcentaje)) / 100);
        resto -= centimos;
        lineas.push(`• ${html(x.cliente?.nombre ?? '—')}${orden.length > 1 ? ` ${Number(x.porcentaje)} %` : ''} · ${euros(centimos / 100)}`);
      });
    }
    return lineas;
  }

  private async tarjeta(id: string, puede: Puede, nota?: string) {
    const g = await this.gasto(id);
    if (!g) return { texto: 'Este gasto ya no existe.', botones: [[{ text: '🧾 Gastos del mes', callback_data: `gm:${hoyMadrid().slice(0, 7)}` }]] as Botones };
    const c = corto(g.id);
    const lineas = this.cabecera(g);
    if (nota) lineas.unshift(nota, '');
    const botones: Botones = [];
    if (puede('PUT', '/gastos/x')) {
      botones.push([{ text: g.reparto.length ? '👤 Cambiar clientes' : '👤 Elegir clientes', callback_data: `gl:${c}:0` }]);
      const tipos = CATEGORIAS_GASTO.map((t) => ({ text: `${t.valor === g.categoria ? '✅ ' : ''}${t.texto}`, callback_data: `gt:${c}:${LETRA_CATEGORIA[t.valor]}` }));
      botones.push(tipos.slice(0, 2), tipos.slice(2));
    }
    const ultima = [];
    if (puede('DELETE', '/gastos/x')) ultima.push({ text: '🗑 Borrar', callback_data: `gb:${c}` });
    ultima.push(this.telegram.abrir('📱 En la app', '/gastos'));
    botones.push(ultima);
    botones.push([{ text: '⬅️ Gastos del mes', callback_data: `gm:${g.fecha.slice(0, 7)}` }]);
    return { texto: lineas.join('\n'), botones };
  }

  /** Clientes por páginas para añadir o quitar del reparto (los elegidos, con ✅ y primero) */
  private async elegirClientes(id: string, pagina: number, nota?: string) {
    const g = await this.gasto(id);
    if (!g) return { texto: 'Este gasto ya no existe.', botones: [] as Botones };
    const c = corto(g.id);
    const elegidos = new Set<string>(g.reparto.map((x: any) => x.cliente_id));
    const todos = (ok(await this.db.from('clientes').select('id, nombre').order('nombre')) ?? []) as any[];
    const lista = [...todos.filter((x) => elegidos.has(x.id)), ...todos.filter((x) => !elegidos.has(x.id))];
    const paginas = Math.max(1, Math.ceil(lista.length / CLIENTES_POR_PAGINA));
    const p = Math.min(Math.max(0, pagina), paginas - 1);
    const lineas = this.cabecera(g);
    lineas.unshift(nota ?? '👤 Pulsa los clientes para añadirlos o quitarlos. Se reparte a partes iguales; porcentajes a medida, en la app.', '');
    const botones: Botones = lista
      .slice(p * CLIENTES_POR_PAGINA, (p + 1) * CLIENTES_POR_PAGINA)
      .map((x) => [{ text: `${elegidos.has(x.id) ? '✅ ' : ''}${x.nombre}`.slice(0, 60), callback_data: `gk:${c}:${corto(x.id)}.${p}` }]);
    if (paginas > 1) {
      const nav = [];
      if (p > 0) nav.push({ text: '◀️ Anteriores', callback_data: `gl:${c}:${p - 1}` });
      nav.push({ text: `${p + 1} de ${paginas}`, callback_data: `gl:${c}:${p}` });
      if (p < paginas - 1) nav.push({ text: 'Siguientes ▶️', callback_data: `gl:${c}:${p + 1}` });
      botones.push(nav);
    }
    botones.push([{ text: '🔍 Buscar cliente', callback_data: `gq:${c}` }, { text: '✔️ Listo', callback_data: `gv:${c}` }]);
    return { texto: lineas.join('\n'), botones };
  }

  /** Añade o quita un cliente y vuelve a repartir a partes iguales */
  private async cambiarCliente(id: string, clienteId: string) {
    const g = await this.gasto(id);
    if (!g) return;
    const ids: string[] = g.reparto.map((x: any) => x.cliente_id);
    const nuevos = ids.includes(clienteId) ? ids.filter((x) => x !== clienteId) : [...ids, clienteId];
    const partes = aPartesIguales(nuevos.length);
    await this.guardar(g, { reparto: nuevos.map((cliente_id, i) => ({ cliente_id, porcentaje: partes[i] })) });
  }

  private async guardar(g: any, cambio: Record<string, unknown>) {
    const { id, reparto, created_at, registrado_por, ...datos } = g;
    await this.gastos.editar(
      id,
      gastoSchema.parse({ ...datos, importe: Number(datos.importe), reparto: reparto.map((x: any) => ({ cliente_id: x.cliente_id, porcentaje: Number(x.porcentaje) })), ...cambio }),
    );
  }

  private async buscarCliente(chatId: number, id: string, texto: string, puede: Puede) {
    if (!puede('PUT', '/gastos/x')) return this.telegram.enviar(chatId, 'No tienes permiso para cambiar gastos.');
    const g = id && (await this.gasto(id));
    if (!g) return this.telegram.enviar(chatId, 'Ese gasto ya no existe.');
    const clientes = (ok(await this.db.from('clientes').select('id, nombre').ilike('nombre', `%${busqueda(texto.trim())}%`).order('nombre').limit(8)) ?? []) as any[];
    const c = corto(g.id);
    if (!clientes.length) {
      return this.telegram.enviar(chatId, `No hay ningún cliente que se llame «${html(texto.trim())}».`, [[{ text: '🔍 Buscar otro', callback_data: `gq:${c}` }, { text: '⬅️ Volver al gasto', callback_data: `gv:${c}` }]]);
    }
    const elegidos = new Set<string>(g.reparto.map((x: any) => x.cliente_id));
    return this.telegram.enviar(chatId, `¿Qué cliente quieres añadir o quitar de «${html(g.concepto)}»?`, [
      ...clientes.map((x) => [{ text: `${elegidos.has(x.id) ? '✅ ' : ''}${x.nombre}`.slice(0, 60), callback_data: `gk:${c}:${corto(x.id)}.0` }]),
      [{ text: '⬅️ Volver al gasto', callback_data: `gv:${c}` }],
    ]);
  }

  /** Línea para la ficha del cliente en el bot */
  async lineaCliente(clienteId: string) {
    const r = (await this.gastos.deCliente(clienteId)) as any;
    return r.cuantos ? `🧾 Gastos: ${euros(r.total_anio)} este año (${euros(r.total)} en total)` : null;
  }

  // ───────────────────────── Botones ─────────────────────────

  async boton(accion: string, id: string, extra: string | undefined, chatId: number, mensajeId: number, puede: Puede, responder: Responder) {
    const sinPermiso = () => responder('No tienes permiso para esto', true);
    switch (accion) {
      case 'gm':
        await responder();
        return this.resumen(chatId, puede, /^\d{4}-\d{2}$/.test(id) ? id : undefined, mensajeId);
      case 'gn':
        if (!puede('POST', '/gastos')) return sinPermiso();
        await responder();
        return this.pedirGasto(chatId);
      case 'gv': {
        if (!puede('GET', '/gastos')) return sinPermiso();
        await responder();
        const v = await this.tarjeta(largo(id), puede);
        return this.telegram.editar(chatId, mensajeId, v.texto, v.botones);
      }
      case 'gl': {
        if (!puede('PUT', '/gastos/x')) return sinPermiso();
        await responder();
        const v = await this.elegirClientes(largo(id), Number(extra) || 0);
        return this.telegram.editar(chatId, mensajeId, v.texto, v.botones);
      }
      case 'gk': {
        if (!puede('PUT', '/gastos/x')) return sinPermiso();
        const [cliente, pagina] = String(extra ?? '').split('.');
        const clienteId = largo(cliente);
        if (!clienteId) return responder();
        await this.cambiarCliente(largo(id), clienteId);
        await responder('Reparto actualizado');
        const v = await this.elegirClientes(largo(id), Number(pagina) || 0);
        return this.telegram.editar(chatId, mensajeId, v.texto, v.botones);
      }
      case 'gt': {
        if (!puede('PUT', '/gastos/x')) return sinPermiso();
        const categoria = CATEGORIA_DE_LETRA[extra ?? ''];
        const g = await this.gasto(largo(id));
        if (!g || !categoria) return responder('Este gasto ya no existe', true);
        if (g.categoria !== categoria) await this.guardar(g, { categoria });
        await responder(nombreCategoriaGasto(categoria));
        const v = await this.tarjeta(g.id, puede);
        return this.telegram.editar(chatId, mensajeId, v.texto, v.botones);
      }
      case 'gq':
        if (!puede('PUT', '/gastos/x')) return sinPermiso();
        await responder();
        return this.preguntar(chatId, `${PREGUNTA_CLIENTE_GASTO}${id}: escribe parte del nombre del cliente`, 'Nombre del cliente…');
      case 'gb': {
        if (!puede('DELETE', '/gastos/x')) return sinPermiso();
        const g = await this.gasto(largo(id));
        if (!g) return responder('Este gasto ya no existe', true);
        await responder();
        return this.telegram.editar(chatId, mensajeId, [...this.cabecera(g), '', '🗑 ¿Seguro que quieres borrar este gasto?'].join('\n'), [
          [{ text: 'Sí, borrarlo', callback_data: `GB:${id}` }, { text: 'No', callback_data: `gv:${id}` }],
        ]);
      }
      case 'GB': {
        if (!puede('DELETE', '/gastos/x')) return sinPermiso();
        const g = await this.gasto(largo(id));
        if (g) await this.gastos.borrar(g.id);
        await responder('Gasto borrado');
        return this.telegram.editar(chatId, mensajeId, g ? `🗑 Borrado: ${html(g.concepto)} · ${euros(Number(g.importe))}` : 'Este gasto ya no existe.', [
          [{ text: '🧾 Gastos del mes', callback_data: `gm:${(g?.fecha ?? hoyMadrid()).slice(0, 7)}` }],
        ]);
      }
    }
    return responder();
  }
}
