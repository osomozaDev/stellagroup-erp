import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { FORMAS_PAGO, FormaPago, lineaDeCatalogo, planDePagos, TIPOS_PROYECTO } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { busqueda, ok } from '../comun/db';
import { fichaDeTexto } from '../comun/alta-cliente';
import { completarUnDato, destinoDato, marcadoresDe } from '../comun/datos-contrato';
import { Botones, html, TelegramService } from '../comun/telegram.service';
import { euros, fechaCorta, hoyMadrid } from './avisos-telegram.service';
import { EnvioFacturaService } from './envio-factura.service';
import { FirmasService } from './firmas.service';
import { OportunidadesController } from './crm.controller';
import { PresupuestosController } from './presupuestos.controller';

/** Preguntas a las que se contesta escribiendo; la de la partida y la del contrato llevan el nº del presupuesto */
export const PREGUNTA_NUEVO_CLIENTE = '👤 Escribe los datos del nuevo cliente';
export const PREGUNTA_CLIENTE_PRESUPUESTO = '📝 ¿Para qué cliente es el presupuesto?';
export const PREGUNTA_PARTIDA = '✍️ Escribe la partida del presupuesto';
export const PREGUNTA_CONTRATO = '📄 Para el contrato del presupuesto';
export const PREGUNTA_DATO = '✏️ Falta en el contrato';
export const PREGUNTA_PAGOS = '💶 Pagos a convenir del presupuesto';
export const PREGUNTAS = [PREGUNTA_NUEVO_CLIENTE, PREGUNTA_CLIENTE_PRESUPUESTO, PREGUNTA_PARTIDA, PREGUNTA_CONTRATO, PREGUNTA_DATO, PREGUNTA_PAGOS];

/** Botones de este servicio (callback_data «accion:id[:extra]») */
const ACCIONES = new Set(['np', 'no', 'pt', 'pa', 'pw', 'pq', 'pl', 'pg', 'pf', 'pm', 'pe', 'PE', 'pp', 'pc', 'cf', 'cd', 'ce', 'CE', 'cp', 'pv', 'pz', 'PZ', 'pr', 'px', 'pk', 'PK', 'kp', 'kc', 'kd', 'KD']);

const TITULO_PROVISIONAL = 'Presupuesto';
const SUFIJO: Record<string, string> = { mes: '/mes', 'año': '/año' };

type Puede = (metodo: string, ruta: string) => boolean;
type Responder = (texto?: string, alerta?: boolean) => Promise<unknown>;
export interface Usuario {
  usuario_id: string;
  nombre: string | null;
  tipo: string;
  permisos: string[];
}

/** «1.000 €», «79,50 €»: sin decimales cuando no los hay, para que quepa en los botones */
const corto = (n: number) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n)} €`;
const nombreDe = (concepto: string) => String(concepto).split('\n')[0];

/** «1.000», «79,5», «12.50» → número */
const precio = (t: string) => Number((/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '') : t).replace(',', '.'));

/** «Logotipo 150», «Hosting 10 al mes», «Dominio 20/año» → una partida del presupuesto */
export function partidaDeTexto(texto: string) {
  const m = texto.trim().match(/^(.+?)\s+(\d[\d.,]*)\s*€?\s*(\/\s*mes|al mes|mensual(?:es)?|\/\s*año|al año|anual(?:es)?)?\.?$/i);
  if (!m) return null;
  const valor = precio(m[2]);
  if (!Number.isFinite(valor)) return null;
  const unidad = !m[3] ? 'ud' : /mes|mensual/i.test(m[3]) ? 'mes' : 'año';
  return { concepto: m[1].trim(), cantidad: 1, unidad, precio: valor };
}

/**
 * Pagos «a convenir» escritos en el chat, uno por línea: la cantidad, la fecha y, si se quiere,
 * a qué corresponde («300 15/11 reserva», «600€ el 6/12/2026 a la entrega»). Sin año, el más
 * cercano a hoy. Si alguna línea no tiene cantidad o fecha, null.
 */
export function pagosDeTexto(texto: string, hoy: string) {
  const lineas = texto.split('\n').map((l) => l.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
  if (!lineas.length || lineas.length > 12) return null;
  const pagos = [];
  for (const l of lineas) {
    // Con «/» o «-» y sin cifras pegadas, para no confundirla con una cantidad como «1.200,50»
    const f = l.match(/(?<![\d.,])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?![\d.,])/);
    if (!f) return null;
    const resto = (l.slice(0, f.index) + ' ' + l.slice(f.index! + f[0].length)).replace(/\s+/g, ' ').trim();
    const c = resto.match(/(\d[\d.,]*)\s*(?:€|euros?)?/i);
    if (!c) return null;
    const importe = precio(c[1]);
    const dia = Number(f[1]), mes = Number(f[2]);
    if (!(importe > 0) || dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
    const dosCifras = (n: number) => String(n).padStart(2, '0');
    // Sin año, el que deja la fecha más cerca de hoy (el 15/11 escrito el 16/11 es de este año; el 10/01, del próximo)
    const año = Number(hoy.slice(0, 4));
    const candidatos = f[3] ? [Number(f[3].length === 2 ? `20${f[3]}` : f[3])] : [año - 1, año, año + 1];
    const distancia = (a: number) => Math.abs(Date.parse(`${a}-${dosCifras(mes)}-${dosCifras(dia)}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`));
    const anio = candidatos.reduce((m, a) => (distancia(a) < distancia(m) ? a : m));
    const fecha = `${anio}-${dosCifras(mes)}-${dosCifras(dia)}`;
    if (new Date(`${fecha}T12:00:00Z`).getUTCDate() !== dia) return null;
    const concepto = resto.replace(c[0], ' ').replace(/^\s*(el|en|y)\s+/i, '').replace(/\s+(el|en)\s*$/i, '').replace(/\s+/g, ' ').trim() || null;
    pagos.push({ fecha, importe, concepto });
  }
  return pagos;
}

/**
 * Clientes, presupuestos y contratos desde el chat: dar de alta un cliente, montar un
 * presupuesto con el catálogo, mandarlo al cliente, pasarlo a contrato y enviarlo a firmar.
 * Lo que llega al cliente siempre pide confirmación antes.
 */
@Injectable()
export class PresupuestosTelegramService {
  private readonly presupuestos: PresupuestosController;

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
    private readonly firmas: FirmasService,
    private readonly envio: EnvioFacturaService,
  ) {
    // La misma lógica que la app (numeración, totales, contrato desde plantilla)
    this.presupuestos = new PresupuestosController(db, envio, firmas);
  }

  esSuya(accion: string) {
    return ACCIONES.has(accion);
  }

  private preguntar(chatId: number, pregunta: string, ejemplo: string) {
    return this.telegram.llamar('sendMessage', { chat_id: chatId, text: pregunta, reply_markup: { force_reply: true, input_field_placeholder: ejemplo } });
  }

  private async correoDe(u: Usuario) {
    const { data } = await this.db.auth.admin.getUserById(u.usuario_id);
    return data.user?.email ?? null;
  }

  // ───────────────────────── Clientes ─────────────────────────

  pedirCliente(chatId: number) {
    return this.preguntar(chatId, `${PREGUNTA_NUEVO_CLIENTE}, uno por línea o separados por comas: nombre, CIF, correo, teléfono y dirección.`, 'Nombre, CIF, correo…');
  }

  pedirClientePresupuesto(chatId: number) {
    return this.preguntar(chatId, `${PREGUNTA_CLIENTE_PRESUPUESTO} Escribe su nombre:`, 'Nombre del cliente…');
  }

  /** Contesta a una de las preguntas de este servicio */
  async contestar(chatId: number, texto: string, pregunta: string, puede: Puede, u: Usuario) {
    try {
      if (pregunta.startsWith(PREGUNTA_NUEVO_CLIENTE)) return await this.crearCliente(chatId, texto, puede);
      if (pregunta.startsWith(PREGUNTA_CLIENTE_PRESUPUESTO)) return await this.elegirCliente(chatId, texto, puede);
      if (pregunta.startsWith(PREGUNTA_DATO)) return await this.datoEscrito(chatId, pregunta, texto, puede, u);
      const numero = pregunta.match(/presupuesto (\S+?):/)?.[1];
      const p = numero ? (ok(await this.db.from('presupuestos').select('id').eq('numero', numero).maybeSingle()) as any) : null;
      if (!p) return this.telegram.enviar(chatId, 'No encuentro ese presupuesto. Empieza de nuevo desde /menu.');
      if (pregunta.startsWith(PREGUNTA_PARTIDA)) return await this.partidaEscrita(chatId, p.id, texto, puede);
      if (pregunta.startsWith(PREGUNTA_CONTRATO)) return await this.crearContrato(chatId, p.id, texto, puede);
      if (pregunta.startsWith(PREGUNTA_PAGOS)) return await this.pagosEscritos(chatId, p.id, texto, puede);
    } catch (e: any) {
      return this.telegram.enviar(chatId, `⚠️ ${html(e.message ?? 'Algo ha fallado. Prueba desde la app.')}`);
    }
  }

  private async crearCliente(chatId: number, texto: string, puede: Puede) {
    if (!puede('POST', '/clientes')) return this.telegram.enviar(chatId, 'No tienes permiso para crear clientes.');
    const ficha = fichaDeTexto(texto.includes('\n') ? texto : texto.split(',').join('\n'));
    if (!ficha.nombre || ficha.nombre.length < 2) return this.telegram.enviar(chatId, 'Falta el nombre del cliente. Vuelve a probar desde /menu.');
    // Si ya existe (mismo CIF o mismo nombre) no se duplica
    const existente =
      (ficha.cif && (ok(await this.db.from('clientes').select('id, nombre').ilike('cif', ficha.cif).limit(1).maybeSingle()) as any)) ||
      (ok(await this.db.from('clientes').select('id, nombre').ilike('nombre', busqueda(ficha.nombre)).limit(1).maybeSingle()) as any);
    if (existente) {
      return this.telegram.enviar(chatId, `👤 <b>${html(existente.nombre)}</b> ya era cliente, no lo he duplicado.`, this.botonesCliente(existente.id, puede));
    }
    const c = ok(await this.db.from('clientes').insert(ficha).select('id, nombre, cif, email, telefono, direccion').single()) as any;
    const lineas = [
      `✅ <b>Cliente creado: ${html(c.nombre)}</b>`,
      c.cif ? `CIF ${html(c.cif)}` : '⚪️ Sin CIF',
      c.email ? `✉️ ${html(c.email)}` : '⚪️ Sin correo (hace falta para mandarle presupuestos y contratos)',
      c.telefono ? `📞 ${html(c.telefono)}` : '',
      c.direccion ? `📍 ${html(c.direccion)}` : '',
    ];
    return this.telegram.enviar(chatId, lineas.filter(Boolean).join('\n'), this.botonesCliente(c.id, puede));
  }

  botonesCliente(id: string, puede: Puede): Botones {
    const filas: Botones = [];
    if (puede('POST', '/presupuestos')) filas.push([{ text: '📝 Nuevo presupuesto', callback_data: `np:${id}` }]);
    filas.push([this.telegram.abrir('Abrir cliente', `/clientes/${id}`)]);
    return filas;
  }

  private async elegirCliente(chatId: number, texto: string, puede: Puede) {
    if (!puede('POST', '/presupuestos')) return this.telegram.enviar(chatId, 'No tienes permiso para hacer presupuestos.');
    const clientes = (ok(await this.db.from('clientes').select('id, nombre').ilike('nombre', `%${busqueda(texto)}%`).order('nombre').limit(8)) ?? []) as any[];
    if (!clientes.length) {
      const filas: Botones = puede('POST', '/clientes') ? [[{ text: '👤 Crear el cliente', callback_data: 'm:nuevocliente' }]] : [];
      return this.telegram.enviar(chatId, `No hay ningún cliente que se llame «${html(texto)}».`, filas);
    }
    if (clientes.length === 1) return this.empezar(chatId, clientes[0].id, puede);
    return this.telegram.enviar(chatId, `Hay ${clientes.length} clientes con «${html(texto)}». ¿Para cuál es?`, clientes.map((c) => [{ text: c.nombre, callback_data: `np:${c.id}` }]));
  }

  // ───────────────────────── Presupuestos ─────────────────────────

  /** Los últimos presupuestos (o los de un cliente) para abrirlos y cambiarlos */
  async listar(chatId: number, texto: string, puede: Puede) {
    if (!puede('GET', '/presupuestos')) return this.telegram.enviar(chatId, 'No tienes permiso para ver presupuestos.');
    let consulta = this.db.from('presupuestos').select('id, numero, estado, total, cliente:clientes!inner(nombre)').order('created_at', { ascending: false }).limit(10);
    if (texto.trim()) consulta = consulta.ilike('cliente.nombre', `%${busqueda(texto.trim())}%`);
    const lista = (ok(await consulta) ?? []) as any[];
    if (!lista.length) return this.telegram.enviar(chatId, texto.trim() ? `No hay presupuestos de «${html(texto.trim())}».` : 'Aún no hay presupuestos.');
    const icono: Record<string, string> = { borrador: '✏️', enviado: '📧', aceptado: '✅', rechazado: '✖️' };
    return this.telegram.enviar(
      chatId,
      `📝 <b>${texto.trim() ? `Presupuestos de «${html(texto.trim())}»` : 'Últimos presupuestos'}</b>\nPulsa uno para verlo o cambiarlo.`,
      lista.map((p) => [{ text: `${icono[p.estado] ?? ''} ${p.numero} · ${p.cliente?.nombre ?? ''} · ${corto(Number(p.total))}`, callback_data: `pv:${p.id}` }]),
    );
  }

  private catalogo() {
    return this.db.from('catalogo').select('id, nombre, descripcion, unidad, precio').eq('activo', true).order('categoria', { nullsFirst: false }).order('precio').order('nombre').then((r) => (ok(r) ?? []) as any[]);
  }

  /** Presupuesto en borrador para el cliente, sin partidas: se van añadiendo con los botones */
  private async empezar(chatId: number, clienteId: string, puede: Puede, deOportunidad?: { oportunidad_id: string; tipo_proyecto: any }) {
    if (!puede('POST', '/presupuestos')) return this.telegram.enviar(chatId, 'No tienes permiso para hacer presupuestos.');
    const e = ok(await this.db.from('empresa').select('iva_pct').eq('id', 1).single()) as any;
    const p = await this.presupuestos.crear({
      cliente_id: clienteId, cliente_texto: null, titulo: TITULO_PROVISIONAL, introduccion: null, fecha: hoyMadrid(), valido_hasta: null,
      iva_pct: Number(e.iva_pct ?? 0), retencion_pct: 0, forma_pago: 'unico', forma_pago_plan: [], forma_pago_texto: null, condiciones: null, notas: null, lineas: [], ...deOportunidad,
    });
    const { texto, botones } = await this.tarjeta(p.id);
    return this.telegram.enviar(chatId, texto, botones);
  }

  /** Presupuesto de una oportunidad: queda enlazado a ella, que pasa a Propuesta y luego a Ganada al firmar */
  private async empezarDeOportunidad(chatId: number, id: string, puede: Puede) {
    const o = ok(await this.db.from('oportunidades').select('cliente_id, tipo_proyecto').eq('id', id).single()) as any;
    const clienteId = o.cliente_id ?? (await new OportunidadesController(this.db).altaCliente(id)).id;
    return this.empezar(chatId, clienteId, puede, { oportunidad_id: id, tipo_proyecto: o.tipo_proyecto ?? null });
  }

  private async cargar(id: string) {
    return this.presupuestos.ver(id);
  }

  private resumen(p: any) {
    const lineas = (p.lineas ?? []).map((l: any) => `• ${html(nombreDe(l.concepto))}${Number(l.cantidad) !== 1 ? ` × ${Number(l.cantidad)}` : ''} · ${euros(Number(l.importe))}${SUFIJO[l.unidad] ?? ''}`);
    const iva = Number(p.iva_pct);
    return [
      `📝 <b>Presupuesto ${html(p.numero)}</b> · ${html(p.cliente?.nombre ?? '')}`,
      ...(p.titulo !== TITULO_PROVISIONAL ? [html(p.titulo)] : []),
      '',
      ...(lineas.length ? lineas : ['Aún no tiene partidas.']),
      // Sin IVA (mientras se contrata como particular), solo el total
      ...(lineas.length && this.hayPagoUnico(p) ? ['', `💶 ${html(FORMAS_PAGO[p.forma_pago as FormaPago]?.nombre ?? '')}`, ...planDePagos(p).map((x) => `   • ${html(x)}`)] : []),
      ...(lineas.length ? ['', ...(iva > 0 ? [`Base: ${euros(Number(p.base))} · IVA ${iva} %: ${euros(Number(p.iva_importe))}`] : []), `<b>Total: ${euros(Number(p.total))}</b>`] : []),
    ].join('\n');
  }

  /** Mientras se monta o se edita: el catálogo en botones, una partida escrita, quitar una y terminar */
  private async tarjeta(id: string, nota?: string) {
    const [p, catalogo] = await Promise.all([this.cargar(id), this.catalogo()]);
    const botones: Botones = [];
    // Uno por fila: los nombres del catálogo son largos y en dos columnas Telegram los corta
    catalogo.forEach((c, i) => botones.push([{ text: `➕ ${c.nombre} · ${corto(Number(c.precio))}${SUFIJO[c.unidad] ?? ''}`, callback_data: `pa:${id}:${i}` }]));
    botones.push([{ text: '✍️ Escribir otra partida', callback_data: `pw:${id}` }]);
    if (p.lineas?.length) botones.push([{ text: '🗑 Quitar una partida', callback_data: `pr:${id}` }, { text: '✅ Listo', callback_data: `pl:${id}` }]);
    const texto = [this.resumen(p), '', nota ?? (catalogo.length ? 'Pulsa lo que lleva, o escribe una partida.' : 'Escribe las partidas con «✍️ Escribir otra partida».')].join('\n');
    return { p, texto, botones };
  }

  /** Cambia las partidas y, si se pasa, la forma de pago (solo en borrador) con la misma lógica que la app */
  private async cambiarPartidas(id: string, cambio: (lineas: any[]) => any[], formaPago?: FormaPago, plan?: any[]) {
    const p = await this.cargar(id);
    if (p.estado !== 'borrador') throw new BadRequestException('Este presupuesto ya se ha enviado: cámbialo desde la app.');
    const actuales = (p.lineas ?? []).map((l: any) => ({ concepto: l.concepto, cantidad: Number(l.cantidad), unidad: l.unidad, precio: Number(l.precio) }));
    const lineas = cambio(actuales);
    // Mientras no se le ponga uno en la app, el título es la partida más cara (la web, no el dominio)
    const automatico = p.titulo === TITULO_PROVISIONAL || actuales.some((l: any) => nombreDe(l.concepto) === p.titulo);
    const principal = [...lineas].sort((a, b) => b.cantidad * b.precio - a.cantidad * a.precio)[0];
    const titulo = automatico ? (principal ? nombreDe(principal.concepto) : TITULO_PROVISIONAL) : p.titulo;
    await this.presupuestos.editar(id, {
      cliente_id: p.cliente_id, cliente_texto: p.cliente_texto, titulo, introduccion: p.introduccion, fecha: p.fecha, valido_hasta: p.valido_hasta,
      iva_pct: Number(p.iva_pct), retencion_pct: Number(p.retencion_pct), forma_pago: formaPago ?? p.forma_pago, forma_pago_texto: p.forma_pago_texto, forma_pago_plan: plan ?? p.forma_pago_plan ?? [], condiciones: p.condiciones, notas: p.notas, lineas,
    });
  }

  private hayPagoUnico(p: any) {
    return (p.lineas ?? []).some((l: any) => l.unidad !== 'mes' && l.unidad !== 'año');
  }

  /** Al terminarlo, antes de nada: qué proyecto se creará cuando lo firme */
  private async preguntarTipo(id: string) {
    const p = await this.cargar(id);
    const botones: Botones = [];
    for (let i = 0; i < TIPOS_PROYECTO.length; i += 2) botones.push(TIPOS_PROYECTO.slice(i, i + 2).map((t) => ({ text: t.nombre, callback_data: `pt:${id}:${t.clave}` })));
    return { texto: [this.resumen(p), '', '🚀 ¿Qué proyecto es? Se creará así cuando lo firme.'].join('\n'), botones };
  }

  /** Al terminarlo: cómo se paga lo de pago único; si no lo hay, directamente las cuotas */
  private async preguntarPago(id: string, puede: Puede) {
    const p = await this.cargar(id);
    if (!this.hayPagoUnico(p)) return this.preguntarCuotas(id, puede);
    // La personalizada necesita escribir el plan de pagos: esa se elige en la app
    const botones: Botones = (Object.entries(FORMAS_PAGO) as [FormaPago, (typeof FORMAS_PAGO)[FormaPago]][]).filter(([clave]) => clave !== 'personalizada' || p.forma_pago === clave).map(([clave, f]) => [
      { text: `${p.forma_pago === clave ? '✓ ' : ''}${f.nombre}`, callback_data: `pf:${id}:${clave}` },
    ]);
    return { texto: [this.resumen(p), '', '💶 ¿Cómo paga lo que es de pago único?'].join('\n'), botones, p };
  }

  /** Con cuotas mensuales: seguir cada mes o pasarlas a un pago al año (doce cuotas) */
  private async preguntarCuotas(id: string, puede: Puede) {
    const p = await this.cargar(id);
    if (!(p.lineas ?? []).some((l: any) => l.unidad === 'mes')) return this.final(id, puede);
    return {
      texto: [this.resumen(p), '', '📅 Las cuotas mensuales (mantenimiento, QR…), ¿se pagan cada mes o en un pago al año?'].join('\n'),
      botones: [[{ text: 'Cada mes', callback_data: `pm:${id}:mes` }, { text: 'Un pago al año', callback_data: `pm:${id}:año` }]] as Botones,
      p,
    };
  }

  private async pedirPagos(chatId: number, id: string) {
    const p = await this.cargar(id);
    return this.preguntar(
      chatId,
      `${PREGUNTA_PAGOS} ${p.numero}: escribe un pago por línea con la cantidad y la fecha, y si quieres a qué corresponde. Total: ${euros(Number(p.total))} (con el primer año de dominio y el primer mes de las cuotas). Por ejemplo:\n520 29/11 reserva\n560 20/12 a la entrega`,
      '300 15/11 reserva…',
    );
  }

  private async pagosEscritos(chatId: number, id: string, texto: string, puede: Puede) {
    if (!puede('PATCH', `/presupuestos/${id}`)) return this.telegram.enviar(chatId, 'No tienes permiso para cambiar presupuestos.');
    const pagos = pagosDeTexto(texto, hoyMadrid());
    if (!pagos) {
      await this.telegram.enviar(chatId, 'No lo he entendido. Cada línea necesita la cantidad y la fecha, p. ej. «300 15/11».');
      return this.pedirPagos(chatId, id);
    }
    await this.cambiarPartidas(id, (ls) => ls, 'convenir', pagos);
    const p = await this.cargar(id);
    const suma = Math.round(pagos.reduce((s, x) => s + x.importe, 0) * 100) / 100;
    const diferencia = Math.round((Number(p.total) - suma) * 100) / 100;
    const aviso = diferencia ? `⚠️ Suman ${euros(suma)}: ${diferencia > 0 ? 'faltan' : 'sobran'} ${euros(Math.abs(diferencia))} para el total.` : '✅ Suman el total.';
    const r = await this.preguntarCuotas(id, puede);
    return this.telegram.enviar(chatId, `${r.texto}\n\n${aviso}`, r.botones);
  }

  private async partidaEscrita(chatId: number, id: string, texto: string, puede: Puede) {
    if (!puede('PATCH', `/presupuestos/${id}`)) return this.telegram.enviar(chatId, 'No tienes permiso para cambiar presupuestos.');
    const linea = partidaDeTexto(texto);
    if (!linea) {
      await this.telegram.enviar(chatId, 'No lo he entendido. Escribe el concepto y el precio, p. ej. «Logotipo 150» o «Hosting 10 al mes».');
      const p = await this.cargar(id);
      return this.preguntar(chatId, `${PREGUNTA_PARTIDA} ${p.numero}: concepto y precio (p. ej. «Logotipo 150» o «Hosting 10 al mes»)`, 'Concepto y precio…');
    }
    await this.cambiarPartidas(id, (ls) => [...ls, linea]);
    const { texto: t, botones } = await this.tarjeta(id, `➕ Añadido: ${html(linea.concepto)}`);
    return this.telegram.enviar(chatId, t, botones);
  }

  /** Ya montado: mandarlo al cliente, el PDF y pasarlo a contrato */
  private async final(id: string, puede: Puede, nota?: string) {
    const p = await this.cargar(id);
    const filas: Botones = [];
    const vivo = (p.contratos ?? []).find((c: any) => c.estado !== 'anulado');
    const fila = [];
    if (['borrador', 'enviado'].includes(p.estado) && puede('POST', `/presupuestos/${id}/firma`)) fila.push({ text: p.estado === 'enviado' ? '📧 Volver a enviar' : '📧 Enviar al cliente', callback_data: `pe:${id}` });
    fila.push({ text: '📥 PDF', callback_data: `pp:${id}` });
    filas.push(fila);
    if (['borrador', 'enviado'].includes(p.estado) && puede('PATCH', `/presupuestos/${id}`)) {
      filas.push([{ text: '✏️ Editar partidas', callback_data: `pz:${id}` }, { text: '💶 Forma de pago', callback_data: `pz:${id}:pago` }]);
    }
    if (vivo) {
      const fila = [{ text: `📄 Ver contrato ${vivo.numero}`, callback_data: `cf:${vivo.id}` }];
      if (vivo.estado !== 'firmado' && puede('POST', `/presupuestos/${id}/contrato`)) fila.push({ text: '🔄 Rehacer contrato', callback_data: `pk:${id}` });
      filas.push(fila);
    }
    else if (p.estado !== 'rechazado' && puede('POST', `/presupuestos/${id}/contrato`)) filas.push([{ text: '📄 Pasar a contrato', callback_data: `pc:${id}` }]);
    if (p.estado !== 'rechazado' && puede('POST', `/presupuestos/${id}/pagos`)) {
      const e = p.pagos;
      filas.push([{ text: e?.cobrado > 0 ? `💶 Pagos · cobrado ${corto(e.cobrado)} de ${corto(e.previsto)}` : '💶 Pagos', callback_data: `kp:${id}` }]);
    }
    filas.push([this.telegram.abrir('Abrir presupuesto', `/presupuestos/${id}`)]);
    const estado: Record<string, string> = { borrador: '✏️ Borrador', enviado: '📧 Enviado, esperando al cliente', aceptado: '✅ Aceptado', rechazado: '✖️ Rechazado' };
    const avisoContrato = vivo && vivo.estado !== 'firmado' && ['borrador', 'enviado'].includes(p.estado) ? [`ℹ️ Si cambias el presupuesto, pulsa «🔄 Rehacer contrato» para que ${html(vivo.numero)} lo recoja.`] : [];
    return { texto: [this.resumen(p), '', `Estado: ${estado[p.estado] ?? p.estado}`, ...(nota ? [nota] : []), ...avisoContrato].join('\n'), botones: filas, p };
  }

  /** Lo previsto y lo cobrado, con un botón por cada pago que falta para marcarlo como cobrado hoy */
  private async vistaPagos(id: string, nota?: string) {
    const p = await this.cargar(id);
    const e = p.pagos;
    const marca = { cobrado: '✅', parcial: '🟡', pendiente: '⚪️' } as Record<string, string>;
    const lineas = e.pagos.map((x: any) => {
      const detalle = x.estado === 'parcial' ? ` · cobrado ${euros(x.cobrado)}, faltan ${euros(x.pendiente)}` : '';
      const vencido = x.estado !== 'cobrado' && x.fecha && x.fecha < hoyMadrid() ? ' · ⚠️ vencido' : '';
      return `${marca[x.estado]} ${html(x.concepto)} · ${euros(x.importe)}${x.fecha ? ` · ${fechaCorta(x.fecha)}` : ''}${detalle}${vencido}`;
    });
    const cobros = (p.cobros ?? []).map((c: any) => `   • ${fechaCorta(c.fecha)} · ${euros(Number(c.importe))}${c.concepto ? ` · ${html(c.concepto)}` : ''}`);
    const texto = [
      `💶 <b>Pagos del presupuesto ${html(p.numero)}</b> · ${html(p.cliente?.nombre ?? '')}`,
      '',
      ...(lineas.length ? lineas : ['No tiene pagos previstos.']),
      '',
      `Cobrado: <b>${euros(e.cobrado)}</b> · Pendiente: <b>${euros(e.pendiente)}</b>`,
      ...(cobros.length ? ['', 'Cobros apuntados:', ...cobros] : []),
      ...(nota ? ['', nota] : []),
      ...(e.pagos.some((x: any) => x.estado !== 'cobrado') ? ['', 'Pulsa el pago que te han hecho: se apunta con fecha de hoy. Para otra fecha o cantidad, ábrelo en la app.'] : []),
    ].join('\n');
    const botones: Botones = e.pagos
      .map((x: any, i: number) => ({ x, i }))
      .filter(({ x }: any) => x.estado !== 'cobrado')
      .map(({ x, i }: any) => [{ text: `✅ Cobrado: ${x.concepto} · ${corto(x.pendiente)}`, callback_data: `kc:${id}:${i}` }]);
    if (cobros.length) botones.push([{ text: '↩️ Quitar el último cobro', callback_data: `kd:${id}` }]);
    botones.push([this.telegram.abrir('Abrir en la app', `/presupuestos/${id}`), { text: '⬅️ Volver', callback_data: `pv:${id}:e` }]);
    return { texto, botones, p };
  }

  // ───────────────────────── Contratos ─────────────────────────

  private async crearContrato(chatId: number, id: string, texto: string, puede: Puede) {
    if (!puede('POST', `/presupuestos/${id}/contrato`)) return this.telegram.enviar(chatId, 'No tienes permiso para hacer contratos.');
    const plazo = Number(texto.match(/\d+/)?.[0]);
    if (!plazo) {
      await this.telegram.enviar(chatId, 'Necesito los días de plazo de entrega, p. ej. «15».');
      return this.pedirDatosContrato(chatId, id);
    }
    const c = await this.presupuestos.aContrato(id, { plazo_dias: plazo });
    const { texto: t, botones } = await this.tarjetaContrato(c.id, puede, c.existente ? 'Este presupuesto ya tenía contrato.' : '✅ Contrato creado con el presupuesto como Anexo I.');
    return this.telegram.enviar(chatId, t, botones);
  }

  private async pedirDatosContrato(chatId: number, id: string) {
    const p = ok(await this.db.from('presupuestos').select('numero').eq('id', id).single()) as any;
    return this.preguntar(chatId, `${PREGUNTA_CONTRATO} ${p.numero}: plazo de entrega en días naturales (lo normal, «15»)`, 'Días de plazo…');
  }

  private async tarjetaContrato(id: string, puede: Puede, nota?: string) {
    const c = ok(await this.db.from('contratos').select('id, numero, titulo, estado, cuerpo, cliente:clientes(nombre, email)').eq('id', id).single()) as any;
    const faltan = marcadoresDe(c.cuerpo).map((m) => destinoDato(m).etiqueta);
    const estado: Record<string, string> = { borrador: '✏️ Borrador', enviado: '✍️ Enviado a firmar', firmado: '✅ Firmado', rechazado: '✖️ Rechazado', anulado: '✖️ Anulado' };
    const lineas = [`📄 <b>Contrato ${html(c.numero)}</b> · ${html(c.cliente?.nombre ?? '')}`, html(c.titulo), `Estado: ${estado[c.estado] ?? c.estado}`];
    if (nota) lineas.push('', nota);
    const filas: Botones = [];
    const editable = ['borrador', 'enviado', 'rechazado'].includes(c.estado);
    if (editable && faltan.length) {
      lineas.push('', `⚠️ Para enviarlo a firmar ${faltan.length === 1 ? 'le falta un dato' : `le faltan ${faltan.length} datos`}:`, ...faltan.slice(0, 10).map((f) => `• ${html(f)}`));
      if (puede('POST', `/contratos/${id}/completar`)) filas.push([{ text: '✏️ Completar aquí', callback_data: `cd:${id}` }, this.telegram.abrir('Completar en la app', `/contratos/${id}?firmar=1`)]);
      else filas.push([this.telegram.abrir('✏️ Completar los datos', `/contratos/${id}?firmar=1`)]);
    } else if (editable && puede('POST', `/contratos/${id}/firma`)) {
      filas.push([{ text: c.estado === 'enviado' ? '✍️ Volver a enviar a firmar' : '✍️ Enviar a firmar', callback_data: `ce:${id}` }]);
    }
    filas.push([{ text: '📥 PDF', callback_data: `cp:${id}` }, this.telegram.abrir('Abrir contrato', `/contratos/${id}`)]);
    return { texto: lineas.join('\n'), botones: filas, c };
  }

  /** Pregunta el primer dato que le falta al contrato; contestado, el siguiente */
  private async pedirDato(chatId: number, id: string, puede: Puede) {
    const c = ok(await this.db.from('contratos').select('numero, cuerpo').eq('id', id).single()) as any;
    const pendientes = marcadoresDe(c.cuerpo);
    if (!pendientes.length) {
      const r = await this.tarjetaContrato(id, puede, '✅ Ya tiene todos los datos.');
      return this.telegram.enviar(chatId, r.texto, r.botones);
    }
    const { etiqueta } = destinoDato(pendientes[0]);
    const quedan = pendientes.length > 1 ? ` (quedan ${pendientes.length})` : '';
    return this.preguntar(chatId, `${PREGUNTA_DATO} ${c.numero}: ${etiqueta}${quedan}. Escríbelo:`, etiqueta);
  }

  private async datoEscrito(chatId: number, pregunta: string, texto: string, puede: Puede, u: Usuario) {
    const numero = pregunta.match(/contrato (\S+?):/)?.[1];
    const c = numero ? (ok(await this.db.from('contratos').select('id, cuerpo').eq('numero', numero).maybeSingle()) as any) : null;
    if (!c) return this.telegram.enviar(chatId, 'No encuentro ese contrato. Empieza de nuevo desde /menu.');
    if (!puede('POST', `/contratos/${c.id}/completar`)) return this.telegram.enviar(chatId, 'No tienes permiso para cambiar contratos.');
    const pendiente = marcadoresDe(c.cuerpo)[0];
    if (pendiente && texto.trim()) {
      await this.firmas.comprobarEditable('contrato', c.id);
      await completarUnDato(this.db, c.id, { tipo: u.tipo, permisos: u.permisos }, pendiente, texto.trim());
    }
    return this.pedirDato(chatId, c.id, puede);
  }

  // ───────────────────────── Botones ─────────────────────────

  async boton(accion: string, id: string, extra: string | undefined, chatId: number, mensajeId: number, puede: Puede, u: Usuario, responder: Responder) {
    const sinPermiso = () => responder('No tienes permiso para esto', true);
    const editar = (r: { texto: string; botones: Botones }) => this.telegram.editar(chatId, mensajeId, r.texto, r.botones);
    switch (accion) {
      case 'np':
        if (!puede('POST', '/presupuestos')) return sinPermiso();
        await responder('📝 Empezando el presupuesto…');
        return this.empezar(chatId, id, puede);

      case 'no':
        if (!puede('POST', '/presupuestos') || !puede('POST', '/clientes')) return sinPermiso();
        await responder('📝 Empezando el presupuesto…');
        return this.empezarDeOportunidad(chatId, id, puede);

      case 'pt': {
        if (!puede('PATCH', `/presupuestos/${id}`)) return sinPermiso();
        const tipo = TIPOS_PROYECTO.find((t) => t.clave === extra);
        if (!tipo) return responder();
        ok(await this.db.from('presupuestos').update({ tipo_proyecto: tipo.clave }).eq('id', id));
        await responder(`🚀 ${tipo.nombre}`);
        return editar(await this.preguntarPago(id, puede));
      }

      case 'pa': {
        if (!puede('PATCH', `/presupuestos/${id}`)) return sinPermiso();
        const c = (await this.catalogo())[Number(extra)];
        if (!c) return responder('El catálogo ha cambiado: vuelve a abrir el presupuesto', true);
        await this.cambiarPartidas(id, (ls) => [...ls, lineaDeCatalogo(c)]);
        await responder(`➕ ${c.nombre}`);
        return editar(await this.tarjeta(id, `➕ Añadido: ${html(c.nombre)}`));
      }

      case 'pw': {
        if (!puede('PATCH', `/presupuestos/${id}`)) return sinPermiso();
        await responder();
        const p = ok(await this.db.from('presupuestos').select('numero').eq('id', id).single()) as any;
        return this.preguntar(chatId, `${PREGUNTA_PARTIDA} ${p.numero}: concepto y precio (p. ej. «Logotipo 150» o «Hosting 10 al mes»)`, 'Concepto y precio…');
      }

      case 'pv': {
        await responder();
        const r = await this.final(id, puede);
        return extra === 'e' ? editar(r) : this.telegram.enviar(chatId, r.texto, r.botones);
      }

      // Editar: en borrador directamente; si ya se envió, primero vuelve a borrador (el enlace del cliente deja de valer)
      case 'pz':
      case 'PZ': {
        if (!puede('PATCH', `/presupuestos/${id}`)) return sinPermiso();
        const p = await this.cargar(id);
        if (!['borrador', 'enviado'].includes(p.estado)) return responder('Este presupuesto ya no se puede cambiar', true);
        if ((p.firmas ?? []).some((f: any) => f.estado === 'firmado')) return responder('El cliente ya lo ha firmado: duplícalo en la app para hacer otro', true);
        if (p.estado === 'enviado') {
          if (accion === 'pz') {
            await responder();
            const r = await this.final(id, puede);
            return editar({
              texto: `${r.texto}\n\n⚠️ Ya se le envió al cliente. Para cambiarlo vuelve a borrador y el enlace que tiene deja de valer; luego se lo puedes volver a mandar.`,
              botones: [[{ text: '✏️ Sí, cambiarlo', callback_data: `PZ:${id}${extra ? `:${extra}` : ''}` }, { text: 'Cancelar', callback_data: `pv:${id}:e` }]],
            });
          }
          await this.presupuestos.cambiarEstado(id, 'borrador');
        }
        await responder('✏️ Editando');
        return editar(extra === 'pago' ? await this.preguntarPago(id, puede) : await this.tarjeta(id));
      }

      case 'pr': {
        if (!puede('PATCH', `/presupuestos/${id}`)) return sinPermiso();
        await responder();
        const p = await this.cargar(id);
        const botones: Botones = (p.lineas ?? []).map((l: any, i: number) => [{ text: `🗑 ${nombreDe(l.concepto)} · ${corto(Number(l.importe))}${SUFIJO[l.unidad] ?? ''}`, callback_data: `px:${id}:${i}` }]);
        botones.push([{ text: '↩️ Volver', callback_data: `pz:${id}` }]);
        return editar({ texto: [this.resumen(p), '', '🗑 ¿Qué partida quitas?'].join('\n'), botones });
      }

      case 'px': {
        if (!puede('PATCH', `/presupuestos/${id}`)) return sinPermiso();
        const i = Number(extra);
        let quitada = '';
        await this.cambiarPartidas(id, (ls) => {
          quitada = ls[i] ? nombreDe(ls[i].concepto) : '';
          return ls.filter((_, j) => j !== i);
        });
        await responder(quitada ? `🗑 Quitada: ${quitada}` : undefined);
        return editar(await this.tarjeta(id, quitada ? `🗑 Quitada: ${html(quitada)}` : undefined));
      }

      // Rehacer el contrato con el presupuesto actual: si estaba enviado a firmar, antes se confirma
      case 'pk':
      case 'PK': {
        if (!puede('POST', `/presupuestos/${id}/contrato`)) return sinPermiso();
        const r = await this.final(id, puede);
        const vivo = (r.p.contratos ?? []).find((c: any) => c.estado !== 'anulado');
        if (!vivo) return responder('Este presupuesto no tiene contrato', true);
        if (accion === 'pk') {
          await responder();
          const enviado = vivo.estado === 'enviado' ? ' Ya se envió a firmar: el enlace que tiene el cliente deja de valer y vuelve a borrador.' : '';
          return editar({
            texto: `${r.texto}\n\n🔄 ¿Rehacer el contrato ${html(vivo.numero)} con el presupuesto como está ahora? Se mantienen el número y el plazo; lo cambiado a mano en el texto se pierde.${enviado}`,
            botones: [[{ text: '🔄 Sí, rehacerlo', callback_data: `PK:${id}` }, { text: 'Cancelar', callback_data: `pv:${id}:e` }]],
          });
        }
        const c = await this.presupuestos.regenerarContrato(id);
        await responder('🔄 Contrato rehecho');
        return editar(await this.tarjetaContrato(c.id, puede, '🔄 Contrato rehecho con el presupuesto actual.'));
      }

      case 'kp': {
        if (!puede('POST', `/presupuestos/${id}/pagos`)) return sinPermiso();
        await responder();
        return editar(await this.vistaPagos(id));
      }

      // Marca como cobrado hoy lo que falta del pago i
      case 'kc': {
        if (!puede('POST', `/presupuestos/${id}/pagos`)) return sinPermiso();
        const p = await this.cargar(id);
        const x = p.pagos?.pagos?.[Number(extra)];
        if (!x || x.estado === 'cobrado') return responder('Ese pago ya está cobrado', true);
        await this.presupuestos.apuntarPago(id, { fecha: hoyMadrid(), importe: x.pendiente, concepto: x.concepto, nota: 'Apuntado desde Telegram' }, { user: { id: u.usuario_id } });
        await responder(`✅ ${euros(x.pendiente)} cobrados`);
        return editar(await this.vistaPagos(id, `✅ Apuntado: ${html(x.concepto)} · ${euros(x.pendiente)}`));
      }

      case 'kd':
      case 'KD': {
        if (!puede('DELETE', `/presupuestos/${id}/pagos/x`)) return sinPermiso();
        const r = await this.vistaPagos(id);
        const ultimo = [...(r.p.cobros ?? [])].sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)).at(-1);
        if (!ultimo) return responder('No hay cobros apuntados', true);
        if (accion === 'kd') {
          await responder();
          return editar({
            texto: `${r.texto}\n\n↩️ ¿Quitar el cobro de ${euros(Number(ultimo.importe))} del ${fechaCorta(ultimo.fecha)}${ultimo.concepto ? ` (${html(ultimo.concepto)})` : ''}? Solo si se apuntó por error.`,
            botones: [[{ text: '↩️ Sí, quitarlo', callback_data: `KD:${id}` }, { text: 'Cancelar', callback_data: `kp:${id}` }]],
          });
        }
        await this.presupuestos.borrarPago(id, ultimo.id);
        await responder('↩️ Cobro quitado');
        return editar(await this.vistaPagos(id, '↩️ Cobro quitado.'));
      }

      case 'pq': {
        if (!puede('PATCH', `/presupuestos/${id}`)) return sinPermiso();
        await this.cambiarPartidas(id, (ls) => ls.slice(0, -1));
        await responder('↩️ Quitada');
        return editar(await this.tarjeta(id));
      }

      // Al terminar un borrador, antes de nada, qué proyecto es y cómo se paga
      case 'pl': {
        await responder();
        const p = await this.cargar(id);
        if (p.estado !== 'borrador' || !puede('PATCH', `/presupuestos/${id}`)) return editar(await this.final(id, puede));
        return editar(p.tipo_proyecto ? await this.preguntarPago(id, puede) : await this.preguntarTipo(id));
      }

      case 'pg':
        if (!puede('PATCH', `/presupuestos/${id}`)) return sinPermiso();
        await responder();
        return editar(await this.preguntarPago(id, puede));

      case 'pf': {
        if (!puede('PATCH', `/presupuestos/${id}`)) return sinPermiso();
        if (!extra || !(extra in FORMAS_PAGO) || extra === 'personalizada') return responder();
        await this.cambiarPartidas(id, (ls) => ls, extra as FormaPago, extra === 'convenir' ? undefined : []);
        await responder(`💶 ${FORMAS_PAGO[extra as FormaPago].nombre}`);
        // A convenir: se escriben las fechas y cantidades de cada pago
        if (extra === 'convenir') return this.pedirPagos(chatId, id);
        return editar(await this.preguntarCuotas(id, puede));
      }

      case 'pm': {
        if (!puede('PATCH', `/presupuestos/${id}`)) return sinPermiso();
        // Un pago al año: cada cuota mensual pasa a anual por doce veces su precio
        if (extra === 'año') await this.cambiarPartidas(id, (ls) => ls.map((l) => (l.unidad === 'mes' ? { ...l, unidad: 'año', precio: Math.round(l.precio * 12 * 100) / 100 } : l)));
        await responder(extra === 'año' ? '📅 Un pago al año' : '📅 Cada mes');
        return editar(await this.final(id, puede));
      }

      // Primer toque: pregunta antes de escribir al cliente
      case 'pe': {
        if (!puede('POST', `/presupuestos/${id}/firma`)) return sinPermiso();
        const r = await this.final(id, puede);
        if (!r.p.cliente?.email) return responder('Este cliente no tiene correo. Añádelo en la app.', true);
        await responder();
        return this.telegram.editar(chatId, mensajeId, `${r.texto}\n\n📧 ¿Mandar el presupuesto a <b>${html(r.p.cliente.email)}</b> para que lo acepte y lo firme?`, [
          [{ text: '📧 Sí, mandarlo', callback_data: `PE:${id}` }, { text: 'Cancelar', callback_data: `pl:${id}` }],
        ]);
      }

      case 'PE': {
        if (!puede('POST', `/presupuestos/${id}/firma`)) return sinPermiso();
        const p = await this.cargar(id);
        if (!p.cliente?.email) return responder('Este cliente no tiene correo. Añádelo en la app.', true);
        await this.firmas.enviar('presupuesto', id, { email: p.cliente.email, nombre: p.cliente.contacto ?? null, mensaje: null, dias: 30, como: 'empresa' }, await this.correoDe(u));
        await responder('📧 Presupuesto enviado');
        return editar(await this.final(id, puede, `📧 <b>Enviado</b> a ${html(p.cliente.email)} (${html(u.nombre ?? 'desde Telegram')})`));
      }

      case 'pp': {
        await responder('📥 Preparando el PDF…');
        await this.telegram.llamar('sendChatAction', { chat_id: chatId, action: 'upload_document' }).catch(() => undefined);
        const { pdf, nombre } = (await this.firmas.pdfFirmado('presupuesto', id)) ?? (await this.envio.pdfDe(await this.cargar(id)));
        return this.telegram.enviarArchivo(chatId, pdf, nombre);
      }

      case 'pc':
        if (!puede('POST', `/presupuestos/${id}/contrato`)) return sinPermiso();
        await responder();
        return this.pedirDatosContrato(chatId, id);

      // Desde el presupuesto, en un mensaje nuevo; al cancelar el envío (extra «e»), en el mismo
      case 'cf': {
        await responder();
        const r = await this.tarjetaContrato(id, puede);
        return extra === 'e' ? editar(r) : this.telegram.enviar(chatId, r.texto, r.botones);
      }

      case 'cd':
        if (!puede('POST', `/contratos/${id}/completar`)) return sinPermiso();
        await responder();
        return this.pedirDato(chatId, id, puede);

      case 'ce': {
        if (!puede('POST', `/contratos/${id}/firma`)) return sinPermiso();
        const r = await this.tarjetaContrato(id, puede);
        if (!r.c.cliente?.email) return responder('Este cliente no tiene correo. Añádelo en la app.', true);
        await responder();
        return this.telegram.editar(chatId, mensajeId, `${r.texto}\n\n✍️ ¿Mandar el contrato a <b>${html(r.c.cliente.email)}</b> para que lo firme?`, [
          [{ text: '✍️ Sí, mandarlo', callback_data: `CE:${id}` }, { text: 'Cancelar', callback_data: `cf:${id}:e` }],
        ]);
      }

      case 'CE': {
        if (!puede('POST', `/contratos/${id}/firma`)) return sinPermiso();
        const c = ok(await this.db.from('contratos').select('cliente:clientes(email, contacto)').eq('id', id).single()) as any;
        if (!c.cliente?.email) return responder('Este cliente no tiene correo. Añádelo en la app.', true);
        await this.firmas.enviar('contrato', id, { email: c.cliente.email, nombre: c.cliente.contacto ?? null, mensaje: null, dias: 30, como: 'empresa' }, await this.correoDe(u));
        await responder('✍️ Contrato enviado a firmar');
        return editar(await this.tarjetaContrato(id, puede, `✍️ <b>Enviado a firmar</b> a ${html(c.cliente.email)} (${html(u.nombre ?? 'desde Telegram')})`));
      }

      case 'cp': {
        await responder('📥 Preparando el PDF…');
        await this.telegram.llamar('sendChatAction', { chat_id: chatId, action: 'upload_document' }).catch(() => undefined);
        const { pdf, nombre } = (await this.firmas.pdfFirmado('contrato', id)) ?? (await this.envio.pdfDe(await this.firmas.documento('contrato', id)));
        return this.telegram.enviarArchivo(chatId, pdf, nombre);
      }
    }
    return responder();
  }
}
