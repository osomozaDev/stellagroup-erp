import { Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { ETAPAS_OPORTUNIDAD, eventoSchema, instanteMadrid, nombreEtapa } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { busqueda, ok } from '../comun/db';
import { Botones, html, TelegramService } from '../comun/telegram.service';
import { diaLargo, diaMadrid, euros, fechaCorta, hoyMadrid, horaMadrid, lineaAviso, lineaEvento } from './avisos-telegram.service';
import { AgendaController, OportunidadesController } from './crm.controller';

/** Pregunta a la que se contesta escribiendo la cita */
export const PREGUNTA_CITA = '📅 Escribe la cita';
const EJEMPLO_CITA = 'p. ej. «mañana 10:30 reunión con Café Origen» o «viernes llamar a Ana»';

/** Botones de este servicio (callback_data «accion:id[:extra]») */
const ACCIONES = new Set(['ag', 'eh', 'eb', 'oo', 'oe', 'ol']);

/** Motivos de pérdida en botones: en el chat no hace falta escribir; para otro motivo, la app */
const MOTIVOS = ['Precio', 'Eligió a otro', 'No era el momento', 'Sin respuesta'];
const CERRADAS = ['ganado', 'perdido'];
/** Los mensajes de Telegram no pueden pasar de 4.096 letras */
const MAX_LINEAS = 40;

type Puede = (metodo: string, ruta: string) => boolean;
type Responder = (texto?: string, alerta?: boolean) => Promise<unknown>;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const dosCifras = (n: number) => String(n).padStart(2, '0');

/**
 * Convierte «mañana 10:30 reunión con Ana» en una cita. Sin hora es de todo el día, y
 * sin fecha ni hora no se adivina: devuelve null. «A las 5» se entiende por la tarde
 * (de 1 a 7 sin minutos), salvo que diga «de la mañana». Se confirma en la respuesta.
 */
export function citaDeTexto(texto: string, hoy: string) {
  let resto = ` ${texto.trim().replace(/\s+/g, ' ')} `;
  const quitar = (m: RegExpMatchArray) => { resto = `${resto.slice(0, m.index!)} ${resto.slice(m.index! + m[0].length)}`; };

  let dia: string | null = null;
  const relativo = resto.match(/\s(pasado mañana|(?<!la )mañana|hoy)(?=[\s,.])/i);
  const semana = sinAcentos(resto).match(/\s(?:el\s+)?(?:proximo\s+|este\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?=[\s,.])/i);
  const numerica = resto.match(/\s(?:el\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=[\s,.])/);
  const escrita = resto.match(/\s(?:el\s+)?(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?=[\s,.])/i);
  const fechaValida = (d: number, m: number, a?: number) => {
    let anio = a ?? Number(hoy.slice(0, 4));
    if (anio < 100) anio += 2000;
    const f = `${anio}-${dosCifras(m)}-${dosCifras(d)}`;
    if (new Date(`${f}T12:00:00Z`).toISOString().slice(0, 10) !== f || Number.isNaN(Date.parse(f))) return null;
    return !a && f < hoy ? `${anio + 1}${f.slice(4)}` : f;
  };
  if (numerica && Number(numerica[2]) <= 12) {
    dia = fechaValida(Number(numerica[1]), Number(numerica[2]), numerica[3] ? Number(numerica[3]) : undefined);
    if (dia) quitar(numerica);
  } else if (escrita) {
    dia = fechaValida(Number(escrita[1]), MESES.indexOf(escrita[2].toLowerCase()) + 1);
    if (dia) quitar(escrita);
  } else if (relativo) {
    const palabra = relativo[1].toLowerCase();
    dia = sumarDias(hoy, palabra === 'hoy' ? 0 : palabra === 'mañana' ? 1 : 2);
    quitar(relativo);
  } else if (semana) {
    const hoyEs = new Date(`${hoy}T12:00:00Z`).getUTCDay();
    dia = sumarDias(hoy, (SEMANA.indexOf(semana[1].toLowerCase()) - hoyEs + 7) % 7 || 7);
    // Se busca sin acentos, pero la frase original conserva la misma longitud
    resto = resto.replace(/\s(?:el\s+)?(?:pr[oó]ximo\s+|este\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?=[\s,.])/i, ' ');
  }

  let hora: string | null = null;
  const conMinutos = resto.match(/\s(?:a las?\s+)?(\d{1,2})[:.h](\d{2})(?:\s*h)?(?=[\s,.])/i);
  const enPunto = resto.match(/\s(?:a las?\s+(\d{1,2})|(\d{1,2})\s*h)(?=[\s,.])/i) ?? (dia ? resto.match(/^\s*(?:,\s*)?()(\d{1,2})(?=[\s,.])(?!\s*(?:€|euros|personas))/) : null);
  if (conMinutos && Number(conMinutos[1]) < 24 && Number(conMinutos[2]) < 60) {
    hora = `${dosCifras(Number(conMinutos[1]))}:${conMinutos[2]}`;
    quitar(conMinutos);
  } else if (enPunto) {
    let h = Number(enPunto[1] || enPunto[2]);
    if (h < 24) {
      quitar(enPunto);
      const manana = resto.match(/\s(?:de|por) la mañana(?=[\s,.])/i);
      if (manana) quitar(manana);
      const tarde = resto.match(/\s(?:de|por) la tarde(?=[\s,.])/i);
      if (tarde) quitar(tarde);
      if (h >= 1 && h <= 7 && !manana) h += 12;
      if (tarde && h < 12) h += 12;
      hora = `${dosCifras(h)}:00`;
    }
  }
  if (!dia && !hora) return null;
  dia ??= hoy;

  const titulo = resto.trim().replace(/^(?:[,.:;-]|a|el|la|de)\s+/i, '').replace(/^[,.:;-]\s*/, '').replace(/[,.:;-]$/, '').trim();
  if (!titulo) return null;
  const n = sinAcentos(titulo).toLowerCase();
  const tipo = /llamada|llamar/.test(n) && !n.includes('videollamada') ? 'llamada' : /reuni|videollamada|visita/.test(n) ? 'reunion' : /entrega|entregar/.test(n) ? 'entrega' : /tarea|enviar|mandar|revisar|preparar|hacer/.test(n) ? 'tarea' : 'reunion';
  return { dia, hora, tipo, titulo: titulo[0].toUpperCase() + titulo.slice(1) };
}

/** Agenda y embudo de ventas desde el chat, con la misma lógica que la app */
@Injectable()
export class CrmTelegramService {
  private readonly agenda: AgendaController;
  private readonly oportunidades: OportunidadesController;

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
  ) {
    this.agenda = new AgendaController(db);
    this.oportunidades = new OportunidadesController(db);
  }

  esSuya(accion: string) {
    return ACCIONES.has(accion);
  }

  // ───────────────────────── Agenda ─────────────────────────

  /** Hoy (con lo atrasado) o los próximos 7 días. Con `mensajeId` se cambia en el mismo mensaje */
  async verAgenda(chatId: number, modo: string, puede: Puede, mensajeId?: number) {
    if (!puede('GET', '/agenda')) return this.telegram.enviar(chatId, 'No tienes permiso para ver la agenda.');
    const semana = modo === 'semana';
    const hoy = hoyMadrid();
    const hasta = semana ? sumarDias(hoy, 6) : hoy;
    const [{ eventos, avisos }, atrasados] = await Promise.all([
      this.agenda.rango(hoy, hasta) as Promise<{ eventos: any[]; avisos: any[] }>,
      this.db.from('eventos').select('id, titulo, tipo, inicio, todo_el_dia, completado_en').is('completado_en', null).lt('inicio', instanteMadrid(hoy)).order('inicio', { ascending: false }).limit(5).then((r) => (ok(r) ?? []) as any[]),
    ]);

    const lineas = [semana ? '📅 <b>Agenda de los próximos 7 días</b>' : `📅 <b>Agenda de hoy</b> · ${diaLargo(hoy)}`, ''];
    if (atrasados.length) lineas.push('⏰ <b>Atrasado</b>', ...atrasados.map((e) => `• ${fechaCorta(diaMadrid(e.inicio))} · ${html(e.titulo)}`), '');
    for (let i = 0, d = hoy; d <= hasta; d = sumarDias(hoy, ++i)) {
      const delDia = eventos.filter((e) => diaMadrid(e.inicio) === d);
      const avisosDia = avisos.filter((a) => a.fecha === d);
      if (!delDia.length && !avisosDia.length) continue;
      if (semana) lineas.push(`<b>${diaLargo(d)}</b>`);
      lineas.push(...delDia.map(lineaEvento), ...avisosDia.map(lineaAviso));
      if (semana) lineas.push('');
    }
    if (!eventos.length && !avisos.length) lineas.push(semana ? 'Nada apuntado esta semana.' : 'Nada apuntado para hoy.');
    const texto = (lineas.length > MAX_LINEAS ? [...lineas.slice(0, MAX_LINEAS), `y ${lineas.length - MAX_LINEAS} líneas más en la app`] : lineas).join('\n').trim();

    const botones: Botones = [];
    if (puede('PATCH', '/agenda/x/completado')) {
      const pendientes = [...atrasados, ...eventos.filter((e) => !e.completado_en && diaMadrid(e.inicio) === hoy)].slice(0, 6);
      for (const e of pendientes) botones.push([{ text: `✅ ${e.titulo}`.slice(0, 60), callback_data: `eh:${e.id}:${semana ? 'semana' : 'hoy'}` }]);
    }
    const fila = [{ text: semana ? '📅 Ver hoy' : '📅 Ver la semana', callback_data: `ag:${semana ? 'hoy' : 'semana'}` }];
    if (puede('POST', '/agenda')) fila.push({ text: '➕ Nueva cita', callback_data: 'm:cita' });
    botones.push(fila, [this.telegram.abrir('Abrir agenda', '/agenda')]);
    return mensajeId ? this.telegram.editar(chatId, mensajeId, texto, botones) : this.telegram.enviar(chatId, texto, botones);
  }

  pedirCita(chatId: number) {
    return this.telegram.llamar('sendMessage', { chat_id: chatId, text: `${PREGUNTA_CITA}: cuándo y qué, ${EJEMPLO_CITA}`, reply_markup: { force_reply: true, input_field_placeholder: 'Mañana 10:30 reunión con…' } });
  }

  /** La apunta directamente: solo se queda en la agenda y se puede deshacer con un botón */
  async crearCita(chatId: number, texto: string, puede: Puede) {
    if (!puede('POST', '/agenda')) return this.telegram.enviar(chatId, 'No tienes permiso para apuntar en la agenda.');
    const cita = citaDeTexto(texto, hoyMadrid());
    if (!cita) {
      await this.telegram.enviar(chatId, 'No lo he entendido: necesito el día o la hora y de qué es la cita.');
      return this.pedirCita(chatId);
    }
    const { cliente, oportunidad } = await this.conQuien(cita.titulo);
    const evento = (await this.agenda.crear(
      eventoSchema.parse({
        titulo: cita.titulo, tipo: cita.tipo, inicio: instanteMadrid(cita.dia, `${cita.hora ?? '00:00'}:00`), todo_el_dia: !cita.hora,
        cliente_id: cliente?.id ?? oportunidad?.cliente_id ?? null, oportunidad_id: oportunidad?.id ?? null,
      }) as any,
    )) as any;
    const lineas = [`✅ <b>Apuntado:</b> ${html(cita.titulo)}`, `📅 ${diaLargo(cita.dia)}, ${cita.hora ?? 'todo el día'}`];
    if (cliente?.nombre) lineas.push(`👤 ${html(cliente.nombre)}`);
    if (oportunidad) lineas.push(`🎯 ${html(oportunidad.titulo)}`);
    const filas: Botones = [];
    if (puede('DELETE', `/agenda/${evento.id}`)) filas.push([{ text: '↩️ Deshacer', callback_data: `eb:${evento.id}` }]);
    filas.push([this.telegram.abrir('Abrir agenda', '/agenda')]);
    return this.telegram.enviar(chatId, lineas.join('\n'), filas);
  }

  /** Si el título nombra a un cliente o a una oportunidad abierta, la cita queda enlazada */
  private async conQuien(titulo: string) {
    const t = sinAcentos(titulo).toLowerCase();
    // «Café Origen» debe encontrar a «Café Origen S.L.»
    const sinSociedad = (n: string) => n.replace(/[\s,]+(s\.?\s?l\.?\s?(u|p)?\.?|s\.?\s?a\.?\s?(u)?\.?|s\.?\s?c\.?(p\.?)?|c\.?\s?b\.?)$/i, '').trim();
    const aparece = (nombre?: string | null) => {
      const n = nombre ? sinAcentos(sinSociedad(nombre)).toLowerCase() : '';
      return n.length >= 3 && t.includes(n);
    };
    const [clientes, abiertas] = await Promise.all([
      this.db.from('clientes').select('id, nombre').then((r) => (ok(r) ?? []) as any[]),
      this.db.from('oportunidades').select('id, titulo, cliente_id, contacto_empresa, contacto_nombre, cliente:clientes(nombre)').not('etapa', 'in', '(ganado,perdido)').then((r) => (ok(r) ?? []) as any[]),
    ]);
    const cliente = clientes.filter((c) => aparece(c.nombre)).sort((a, b) => b.nombre.length - a.nombre.length)[0] ?? null;
    const oportunidad = abiertas.filter((o) => aparece(o.cliente?.nombre) || aparece(o.contacto_empresa) || aparece(o.contacto_nombre) || aparece(o.titulo));
    // Con varias abiertas del mismo cliente no se elige una al azar
    return { cliente, oportunidad: oportunidad.length === 1 ? oportunidad[0] : null };
  }

  // ───────────────────────── Oportunidades ─────────────────────────

  /** Embudo: cuántas hay por etapa y un botón por cada oportunidad abierta */
  async verEmbudo(chatId: number, texto: string, puede: Puede) {
    if (!puede('GET', '/oportunidades')) return this.telegram.enviar(chatId, 'No tienes permiso para ver las oportunidades.');
    const lista = (await this.oportunidades.listar(texto || undefined)) as any[];
    if (texto) {
      if (!lista.length) return this.telegram.enviar(chatId, `No hay ninguna oportunidad con «${html(texto)}».`);
      if (lista.length === 1) return this.ficha(chatId, lista[0].id, puede);
      return this.telegram.enviar(chatId, `Hay ${lista.length} oportunidades con «${html(texto)}». ¿Cuál?`, lista.slice(0, 8).map((o) => [{ text: `${nombreEtapa(o.etapa)} · ${o.titulo}`.slice(0, 60), callback_data: `oo:${o.id}` }]));
    }
    const abiertas = lista.filter((o) => !CERRADAS.includes(o.etapa));
    if (!abiertas.length) return this.telegram.enviar(chatId, '🎯 No hay oportunidades abiertas.', [[this.telegram.abrir('Abrir CRM', '/crm')]]);
    const suma = (l: any[]) => l.reduce((s, o) => s + Number(o.importe ?? 0), 0);
    const etapas = ETAPAS_OPORTUNIDAD.filter((e) => !CERRADAS.includes(e.clave));
    const lineas = [`🎯 <b>Embudo de ventas</b> · ${euros(suma(abiertas))} abiertos`, ''];
    for (const e of etapas) {
      const deEtapa = abiertas.filter((o) => o.etapa === e.clave);
      if (deEtapa.length) lineas.push(`<b>${e.nombre}</b>: ${deEtapa.length} · ${euros(suma(deEtapa))}`);
    }
    const orden = (o: any) => etapas.length - etapas.findIndex((e) => e.clave === o.etapa);
    const botones: Botones = [...abiertas].sort((a, b) => orden(a) - orden(b)).slice(0, 12).map((o) => [{ text: `${nombreEtapa(o.etapa)} · ${o.titulo}`.slice(0, 60), callback_data: `oo:${o.id}` }]);
    botones.push([this.telegram.abrir('Abrir CRM', '/crm')]);
    return this.telegram.enviar(chatId, lineas.join('\n'), botones);
  }

  private async tarjeta(id: string, puede: Puede, nota?: string) {
    const o = (await this.oportunidades.ver(id)) as any;
    const lineas = [`🎯 <b>${html(o.titulo)}</b>`, `Etapa: <b>${html(nombreEtapa(o.etapa))}</b>`];
    if (o.con_quien) lineas.push(`Con: ${html(o.con_quien)}`);
    if (o.importe != null) lineas.push(`Importe: ${euros(Number(o.importe))}`);
    if (o.cierre_previsto) lineas.push(`Cierre previsto: ${fechaCorta(o.cierre_previsto)}`);
    const telefono = o.cliente?.telefono ?? o.contacto_telefono;
    const correo = o.cliente?.email ?? o.contacto_email;
    if (telefono) lineas.push(`📞 ${html(telefono)}`);
    if (correo) lineas.push(`✉️ ${html(correo)}`);
    if (o.motivo_perdida) lineas.push(`Motivo: ${html(o.motivo_perdida)}`);
    const proximo = (o.eventos ?? []).find((e: any) => !e.completado_en);
    if (proximo) lineas.push(`📅 Próximo: ${fechaCorta(diaMadrid(proximo.inicio))}${proximo.todo_el_dia ? '' : ` ${horaMadrid(proximo.inicio)}`} · ${html(proximo.titulo)}`);
    if (nota) lineas.push('', nota);

    const filas: Botones = [];
    if (puede('PATCH', `/oportunidades/${id}/etapa`)) {
      if (CERRADAS.includes(o.etapa)) filas.push([{ text: '↩️ Volver a abrirla', callback_data: `oe:${id}:contactado` }]);
      else {
        const otras = ETAPAS_OPORTUNIDAD.filter((e) => !CERRADAS.includes(e.clave) && e.clave !== o.etapa).map((e) => ({ text: e.nombre, callback_data: `oe:${id}:${e.clave}` }));
        for (let i = 0; i < otras.length; i += 2) filas.push(otras.slice(i, i + 2));
        filas.push([{ text: '✅ Ganada', callback_data: `oe:${id}:ganado` }, { text: '✖️ Perdida', callback_data: `oe:${id}:perdido` }]);
      }
    }
    const sinCliente = !o.cliente_id;
    if (!CERRADAS.includes(o.etapa) && !o.presupuestos?.length && puede('POST', '/presupuestos') && (!sinCliente || puede('POST', '/clientes'))) {
      filas.push([{ text: sinCliente ? '📝 Dar de alta y hacer presupuesto' : '📝 Hacer presupuesto', callback_data: `no:${id}` }]);
    }
    filas.push([this.telegram.abrir('Abrir oportunidad', `/crm/${id}`)]);
    return { texto: lineas.join('\n'), botones: filas };
  }

  private async ficha(chatId: number, id: string, puede: Puede) {
    const r = await this.tarjeta(id, puede);
    return this.telegram.enviar(chatId, r.texto, r.botones);
  }

  // ───────────────────────── Botones ─────────────────────────

  async boton(accion: string, id: string, extra: string | undefined, chatId: number, mensajeId: number, puede: Puede, responder: Responder) {
    const sinPermiso = () => responder('No tienes permiso para esto', true);
    switch (accion) {
      case 'ag':
        await responder();
        return this.verAgenda(chatId, id, puede, mensajeId);

      case 'eh':
        if (!puede('PATCH', `/agenda/${id}/completado`)) return sinPermiso();
        await this.agenda.completar(id, { completado: true });
        await responder('✅ Hecho');
        return this.verAgenda(chatId, extra ?? 'hoy', puede, mensajeId);

      case 'eb':
        if (!puede('DELETE', `/agenda/${id}`)) return sinPermiso();
        await this.agenda.borrar(id);
        await responder('↩️ Quitado de la agenda');
        return this.telegram.editar(chatId, mensajeId, '↩️ Cita quitada de la agenda.', [[{ text: '➕ Nueva cita', callback_data: 'm:cita' }]]);

      case 'oo':
        await responder();
        if (!puede('GET', '/oportunidades')) return sinPermiso();
        return this.ficha(chatId, id, puede);

      case 'oe': {
        if (!puede('PATCH', `/oportunidades/${id}/etapa`)) return sinPermiso();
        // Perderla pide el motivo
        if (extra === 'perdido') {
          await responder();
          const r = await this.tarjeta(id, puede);
          return this.telegram.editar(chatId, mensajeId, `${r.texto}\n\n✖️ ¿Por qué se ha perdido?`, [
            ...MOTIVOS.map((m, i) => [{ text: m, callback_data: `ol:${id}:${i}` }]),
            [{ text: 'Cancelar', callback_data: `oo:${id}` }],
          ]);
        }
        if (!ETAPAS_OPORTUNIDAD.some((e) => e.clave === extra)) return responder();
        await this.oportunidades.mover(id, { etapa: extra as any, motivo_perdida: null });
        await responder(nombreEtapa(extra!));
        const r = await this.tarjeta(id, puede);
        return this.telegram.editar(chatId, mensajeId, r.texto, r.botones);
      }

      case 'ol': {
        if (!puede('PATCH', `/oportunidades/${id}/etapa`)) return sinPermiso();
        const motivo = MOTIVOS[Number(extra)];
        if (!motivo) return responder();
        await this.oportunidades.mover(id, { etapa: 'perdido', motivo_perdida: motivo });
        await responder('✖️ Perdida');
        const r = await this.tarjeta(id, puede);
        return this.telegram.editar(chatId, mensajeId, r.texto, r.botones);
      }
    }
    return responder();
  }
}
