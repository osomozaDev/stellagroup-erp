import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseClient } from '@supabase/supabase-js';
import { primerDiaMes } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';
import { fechaCorta, hoyMadrid } from '../comun/fechas';
import { html, TelegramService } from '../comun/telegram.service';
import { AgendaController } from './crm.controller';

export { fechaCorta, hoyMadrid };
export const euros = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n);
const nombreMes = (periodo: string) => new Date(`${periodo}T12:00:00Z`).toLocaleDateString('es-ES', { month: 'long' });
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const doc = (f: { numero?: string | null }) => (f.numero ? `Factura ${f.numero}` : 'Prefactura');
export const horaMadrid = (f: string) => new Date(f).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
export const diaMadrid = (f: string) => new Date(f).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
/** «jueves 5 nov» */
export const diaLargo = (f: string) => `${new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long' })} ${fechaCorta(f)}`;

const ICONO_EVENTO: Record<string, string> = { reunion: '🤝', llamada: '📞', tarea: '📌', entrega: '🚩', otro: '🗓' };
const ICONO_AVISO: Record<string, string> = { hito: '🎯', entrega: '🚩', renovacion: '🔁', cierre: '🤝' };
const enlaceWeb = (url: string, texto: string) => `<a href="${html(url).replace(/"/g, '&quot;')}">${html(texto)}</a>`;

/** Una línea de la agenda, con sus enlaces para abrirlos directamente desde el chat */
export function lineaEvento(e: any) {
  const lugarWeb = /^https?:\/\//i.test(e.lugar ?? '');
  const enlaces = [
    ...(lugarWeb ? [enlaceWeb(e.lugar, 'Videollamada')] : []),
    ...(e.enlaces ?? []).map((l: any) => enlaceWeb(l.url, l.nombre || new URL(l.url).hostname)),
  ];
  const detalle = [e.cliente?.nombre ?? e.oportunidad?.titulo ?? e.proyecto?.nombre, e.lugar && !lugarWeb ? e.lugar : null].filter(Boolean).map(html);
  return `${e.completado_en ? '✅' : (ICONO_EVENTO[e.tipo] ?? '🗓')} ${e.todo_el_dia ? '' : `${horaMadrid(e.inicio)} · `}${html(e.titulo)}${detalle.length ? ` (${detalle.join(', ')})` : ''}${enlaces.length ? `\n   🔗 ${enlaces.join(' · ')}` : ''}`;
}

export const lineaAviso = (a: any) => `${ICONO_AVISO[a.tipo] ?? '•'} ${html(a.titulo)}${a.detalle ? ` · ${html(a.detalle)}` : ''}`;

/** Avisos que dependen del día: vencidas, fin de mes y el resumen de los lunes */
@Injectable()
export class AvisosTelegramService {
  private readonly log = new Logger('AvisosTelegram');

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
  ) {}

  private enlace(ruta: string, texto: string) {
    return `<a href="${this.telegram.web}${ruta}">${html(texto)}</a>`;
  }

  async pendientes() {
    return (ok(
      await this.db.from('facturas').select('id, numero, total, vencimiento, cliente:clientes(nombre)').eq('estado', 'emitida').order('vencimiento'),
    ) ?? []) as any[];
  }

  /** Lo que te deben ahora mismo, con lo vencido delante */
  async textoResumen(titulo = '📊 <b>Cómo van los cobros</b>') {
    const hoy = hoyMadrid();
    const facturas = await this.pendientes();
    const vencidas = facturas.filter((f) => f.vencimiento && f.vencimiento < hoy);
    const suma = (l: any[]) => l.reduce((s, f) => s + Number(f.total), 0);
    const lineas = [titulo, ''];
    if (!facturas.length) return [...lineas, 'No te deben nada. 👍'].join('\n');
    lineas.push(`Te deben <b>${euros(suma(facturas))}</b> en ${facturas.length === 1 ? '1 factura' : `${facturas.length} facturas`}.`);
    if (vencidas.length) {
      lineas.push(`🔴 Vencidas: <b>${vencidas.length}</b> por ${euros(suma(vencidas))}`, '');
      for (const f of vencidas.slice(0, 5)) {
        lineas.push(`• ${this.enlace(`/facturas/${f.id}`, `${doc(f)} · ${f.cliente?.nombre ?? ''}`)}: ${euros(Number(f.total))}, hace ${diasEntre(f.vencimiento, hoy)} días`);
      }
      if (vencidas.length > 5) lineas.push(`y ${vencidas.length - 5} más`);
    } else {
      lineas.push('✅ Ninguna vencida.');
    }
    return lineas.join('\n');
  }

  async textoPendientes() {
    const hoy = hoyMadrid();
    const facturas = await this.pendientes();
    if (!facturas.length) return 'No hay facturas por cobrar. 👍';
    const lineas = ['🧾 <b>Facturas sin cobrar</b>', ''];
    for (const f of facturas.slice(0, 20)) {
      const vencida = f.vencimiento && f.vencimiento < hoy;
      lineas.push(
        `${vencida ? '🔴' : '⚪️'} ${this.enlace(`/facturas/${f.id}`, `${doc(f)} · ${f.cliente?.nombre ?? ''}`)}: ${euros(Number(f.total))}` +
          (f.vencimiento ? ` · ${vencida ? 'venció' : 'vence'} el ${fechaCorta(f.vencimiento)}` : ''),
      );
    }
    if (facturas.length > 20) lineas.push(`y ${facturas.length - 20} más en ${this.enlace('/facturas?estado=emitida', 'la app')}`);
    return lineas.join('\n');
  }

  /** Cada mañana. Las claves de avisos_enviados evitan repetir si se llama dos veces */
  @Cron('0 9 * * *', { timeZone: 'Europe/Madrid' })
  async diarios() {
    if (!this.telegram.configurado) return { configurado: false };
    const hoy = hoyMadrid();
    const enviados = { vencidas: 0, facturar: 0, renovaciones: 0, semanal: 0, agenda: 0 };

    // Lo de hoy en la agenda: un solo mensaje, y ninguno si no hay nada
    const agenda = await this.textoAgendaHoy(hoy);
    if (agenda) {
      enviados.agenda += await this.telegram.avisarUnaVez(`agenda:${hoy}`, 'agenda', agenda, { botones: [[{ text: '📅 Ver y marcar hecho', callback_data: 'ag:hoy' }], [this.telegram.abrir('Abrir agenda', '/agenda')]] });
    }

    // Facturas que han vencido (como mucho de la última semana, para no inundar el primer día)
    const vencidas = (await this.pendientes()).filter((f) => f.vencimiento && f.vencimiento < hoy && f.vencimiento >= sumarDias(hoy, -7));
    for (const f of vencidas) {
      const texto = `⏰ <b>Ha vencido sin cobrar</b>\n${this.enlace(`/facturas/${f.id}`, `${doc(f)} · ${f.cliente?.nombre ?? ''}`)}\n${euros(Number(f.total))} · vencía el ${fechaCorta(f.vencimiento)}`;
      enviados.vencidas += await this.telegram.avisarUnaVez(`vencida:${f.id}`, 'vencidas', texto, {
        botones: [
          [{ text: '✅ Cobrada', callback_data: `c:${f.id}` }, { text: '📧 Mandar recordatorio', callback_data: `r:${f.id}` }],
          [this.telegram.abrir('Abrir factura', `/facturas/${f.id}`)],
        ],
      });
    }

    // Servicios que renuevan dentro de 7 días: se avisa una vez por servicio y fecha
    const renuevan = (ok(
      await this.db
        .from('servicios')
        .select('id, nombre, detalle, precio, proxima_renovacion, cliente:clientes(nombre)')
        .eq('estado', 'activo')
        .gte('proxima_renovacion', hoy)
        .lte('proxima_renovacion', sumarDias(hoy, 7)),
    ) ?? []) as any[];
    for (const r of renuevan) {
      const texto = `🔁 <b>Renueva el ${fechaCorta(r.proxima_renovacion)}</b>\n${this.enlace(`/servicios/${r.id}`, `${r.nombre}${r.detalle ? ` (${r.detalle})` : ''}`)} · ${html(r.cliente?.nombre ?? '')}\n${euros(Number(r.precio))} sin IVA`;
      enviados.renovaciones += await this.telegram.avisarUnaVez(`renovacion:${r.id}:${r.proxima_renovacion}`, 'renovaciones', texto, {
        botones: [[this.telegram.abrir('Facturar renovaciones', '/servicios?facturar=1')]],
      });
    }

    // Los 3 últimos días del mes, si quedan proyectos por horas sin factura de este mes
    const periodo = primerDiaMes(hoy);
    const finDeMes = sumarDias(primerDiaMes(sumarDias(periodo, 32)), -1);
    const quedan = diasEntre(hoy, finDeMes);
    if (quedan <= 2) {
      const [proyectos, facturadas] = await Promise.all([
        this.db.from('proyectos').select('id, nombre').eq('estado', 'activo').eq('modalidad', 'horas'),
        this.db.from('facturas').select('proyecto_id').eq('periodo', periodo).in('estado', ['emitida', 'cobrada']).is('rectifica_id', null),
      ]);
      const hechas = new Set((ok(facturadas) ?? []).map((f: any) => f.proyecto_id));
      const faltan = ((ok(proyectos) ?? []) as any[]).filter((o) => !hechas.has(o.id));
      if (faltan.length) {
        const cuando = quedan === 0 ? 'Hoy acaba' : quedan === 1 ? 'Mañana acaba' : `Quedan ${quedan + 1} días de`;
        const texto = [
          `🧾 <b>${cuando} ${nombreMes(periodo)}</b> y ${faltan.length === 1 ? 'te falta 1 proyecto' : `te faltan ${faltan.length} proyectos`} por facturar:`,
          ...faltan.slice(0, 8).map((o) => `• ${html(o.nombre)}`),
          ...(faltan.length > 8 ? [`y ${faltan.length - 8} más`] : []),
        ].join('\n');
        enviados.facturar += await this.telegram.avisarUnaVez(`facturar:${hoy}`, 'facturar', texto, {
          botones: [[{ text: '🧾 Facturar desde aquí', callback_data: `fm:${periodo}` }], [this.telegram.abrir('Abrir «Facturar el mes»', '/facturar-mes')]],
        });
      }
    }

    // Los lunes, resumen de la semana pasada
    if (new Date(`${hoy}T12:00:00Z`).getUTCDay() === 1) {
      enviados.semanal += await this.telegram.avisarUnaVez(`semanal:${hoy}`, 'semanal', await this.textoSemanal(hoy));
    }
    if (enviados.vencidas + enviados.facturar + enviados.renovaciones + enviados.semanal + enviados.agenda) this.log.log(`Avisos de Telegram: ${JSON.stringify(enviados)}`);
    return enviados;
  }

  /** La agenda de hoy para el aviso de la mañana; null si no hay nada */
  async textoAgendaHoy(hoy = hoyMadrid()) {
    const { eventos, avisos } = (await new AgendaController(this.db).rango(hoy, hoy)) as { eventos: any[]; avisos: any[] };
    const pendientes = eventos.filter((e) => !e.completado_en);
    if (!pendientes.length && !avisos.length) return null;
    return [`📅 <b>Hoy, ${diaLargo(hoy)}</b>`, '', ...pendientes.map(lineaEvento), ...avisos.map(lineaAviso)].join('\n');
  }

  async textoSemanal(hoy = hoyMadrid()) {
    const desde = sumarDias(hoy, -7);
    const [facturado, cobrado] = await Promise.all([
      this.db.from('facturas').select('base').in('estado', ['emitida', 'cobrada']).gte('fecha', desde).lt('fecha', hoy),
      this.db.from('facturas').select('total').eq('estado', 'cobrada').gte('cobrada_en', desde).lt('cobrada_en', hoy),
    ]);
    const suma = (l: any[] | null, campo: string) => (l ?? []).reduce((s, f) => s + Number(f[campo]), 0);
    const cabecera = [
      '📅 <b>Resumen de la semana</b>',
      '',
      `Facturado: <b>${euros(suma(ok(facturado), 'base'))}</b> (sin IVA)`,
      `Cobrado: <b>${euros(suma(ok(cobrado), 'total'))}</b>`,
    ].join('\n');
    return `${cabecera}\n\n${await this.textoResumen('💶 <b>Por cobrar</b>')}`;
  }
}
