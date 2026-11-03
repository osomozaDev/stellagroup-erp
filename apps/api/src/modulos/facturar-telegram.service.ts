import { Inject, Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { nombreMes, primerDiaMes } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';
import { Botones, html, TelegramService } from '../comun/telegram.service';
import { euros, hoyMadrid } from './avisos-telegram.service';
import { EnvioFacturaService } from './envio-factura.service';
import { FacturasService } from './facturas.service';

const num = (n: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Marca de la pregunta de horas; la respuesta trae el enlace a la prefactura para saber cuál es */
export const PREGUNTA_HORAS = '✏️ ¿Cuántas horas';

type Puede = (metodo: string, ruta: string) => boolean;

/**
 * «Facturar el mes» desde el chat: una tarjeta por proyecto con su prefactura, para
 * cambiar horas, mandarla como prefactura o emitirla y enviarla al cliente.
 * Lo que llega al cliente siempre pide confirmación antes.
 */
@Injectable()
export class FacturarTelegramService {
  private readonly log = new Logger('FacturarTelegram');

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
    private readonly facturas: FacturasService,
    private readonly envio: EnvioFacturaService,
  ) {}

  /** Mes anterior y mes actual (a primeros de mes se suele facturar el anterior) */
  elegirMes(chatId: number) {
    const actual = primerDiaMes(hoyMadrid());
    const d = new Date(`${actual}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    const anterior = d.toISOString().slice(0, 10);
    const boton = (p: string) => ({ text: `🧾 ${nombreMes(p)}`, callback_data: `fm:${p}` });
    const filas: Botones = Number(hoyMadrid().slice(8)) <= 15 ? [[boton(anterior)], [boton(actual)]] : [[boton(actual)], [boton(anterior)]];
    return this.telegram.enviar(chatId, '🧾 <b>¿Qué mes quieres facturar?</b>', filas);
  }

  async empezar(chatId: number, periodo: string, puede: Puede) {
    await this.telegram.enviar(chatId, `⏳ Preparando las prefacturas de ${nombreMes(periodo)}…`);
    const { ids, errores } = await this.facturas.prefacturasMes(periodo);
    if (!ids.length && !errores.length) {
      return this.telegram.enviar(chatId, `✅ Todas los proyectos activos tienen ya su factura de ${nombreMes(periodo)}.`, [[this.telegram.abrir('Ver facturas', '/facturas')]]);
    }
    for (const id of ids) {
      const { texto, botones } = await this.tarjeta(id, puede);
      await this.telegram.enviar(chatId, texto, botones);
    }
    const resumen = [
      `📋 <b>${ids.length === 1 ? '1 proyecto' : `${ids.length} proyectos`} por facturar en ${nombreMes(periodo)}</b>`,
      '',
      ids.length > 1 ? 'Revisa las horas de cada una. Puedes mandarlas una a una o todas a la vez.' : 'Revisa las horas y mándala desde su tarjeta.',
      ...(errores.length ? ['', '⚠️ No se han podido preparar:', ...errores.map((e) => `• ${html(e)}`)] : []),
    ].join('\n');
    const filas: Botones = [];
    if (ids.length > 1 && puede('POST', '/facturas/facturar-mes') && puede('POST', '/cobros/enviar-factura')) {
      filas.push([{ text: `📤 Emitir y enviar las ${ids.length}`, callback_data: `fa:${periodo}` }]);
    }
    filas.push([this.telegram.abrir('Abrir «Facturar el mes»', '/facturar-mes')]);
    return this.telegram.enviar(chatId, resumen, filas);
  }

  private async cargar(id: string) {
    return ok(
      await this.db
        .from('facturas')
        .select('id, estado, numero, base, total, periodo, proyecto:proyectos(nombre), cliente:clientes(nombre, email), lineas:factura_lineas(concepto, cantidad, precio, unidad, orden)')
        .eq('id', id)
        .single(),
    ) as any;
  }

  /** Texto y botones de la tarjeta de un proyecto, según cómo esté su factura */
  async tarjeta(id: string, puede: Puede, nota?: string) {
    const f = await this.cargar(id);
    const lineas = [...f.lineas].sort((a: any, b: any) => a.orden - b.orden);
    const l = lineas[0];
    const texto = [
      `🏗️ <b>${html(f.proyecto?.nombre ?? 'Sin proyecto')}</b> · ${html(f.cliente?.nombre)}`,
      l ? `<i>${html(l.concepto)}</i>` : '',
      l ? `${num(Number(l.cantidad))} ${html(l.unidad ?? 'h')} × ${euros(Number(l.precio))} = ${euros(Number(l.cantidad) * Number(l.precio))}` : '',
      lineas.length > 1 ? `+ ${lineas.length - 1} ${lineas.length === 2 ? 'línea más' : 'líneas más'}` : '',
      `Base ${euros(Number(f.base))} · <b>Total ${euros(Number(f.total))}</b>`,
      f.cliente?.email ? `✉️ ${html(f.cliente.email)}` : '⚠️ El cliente no tiene correo: añádelo en la app para poder enviarla',
      nota ? `\n${nota}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const botones: Botones = [];
    if (f.estado === 'borrador') {
      if (puede('PATCH', `/facturas/${id}`)) botones.push([{ text: '✏️ Cambiar horas', callback_data: `fh:${id}` }]);
      if (f.cliente?.email && puede('POST', '/cobros/enviar-factura')) {
        const fila = [{ text: '📝 Mandar prefactura', callback_data: `fp:${id}` }];
        if (puede('POST', `/facturas/${id}/emitir`)) fila.push({ text: '📤 Emitir y enviar', callback_data: `fe:${id}` });
        botones.push(fila);
      }
    }
    botones.push([this.telegram.abrir(f.estado === 'borrador' ? 'Abrir en la app' : 'Abrir factura', `/facturas/${id}`)]);
    return { f, texto, botones };
  }

  /** Pregunta las horas; el nombre del proyecto enlaza a la prefactura y así se sabe a cuál contesta */
  async preguntarHoras(chatId: number, id: string) {
    const f = await this.cargar(id);
    const horas = [...f.lineas].sort((a: any, b: any) => a.orden - b.orden)[0]?.cantidad;
    return this.telegram.llamar('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text: `${PREGUNTA_HORAS} para <a href="${this.telegram.web}/facturas/${id}">${html(f.proyecto?.nombre ?? 'este proyecto')}</a>? Ahora son ${num(Number(horas ?? 0))}.`,
      reply_markup: { force_reply: true, input_field_placeholder: 'Horas, p. ej. 168' },
    });
  }

  /** Respuesta a la pregunta de horas. respuesta = mensaje al que contesta (con sus enlaces) */
  async contestarHoras(chatId: number, texto: string, respuesta: any, puede: Puede) {
    const enlace = (respuesta?.entities ?? []).map((e: any) => e.url).find((u: string) => u && UUID.test(u));
    const id = enlace?.match(UUID)?.[0];
    if (!id) return this.telegram.enviar(chatId, 'No sé a qué proyecto te refieres. Pulsa otra vez «✏️ Cambiar horas».');
    if (!puede('PATCH', `/facturas/${id}`)) return this.telegram.enviar(chatId, 'No tienes permiso para cambiar facturas.');
    const horas = Number(texto.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(horas) || horas < 0 || horas > 10000) return this.telegram.enviar(chatId, 'Escribe solo el número de horas, por ejemplo 168 o 172,5.');
    await this.facturas.cambiarHorasBorrador(id, horas);
    const { texto: t, botones } = await this.tarjeta(id, puede, `✏️ Horas cambiadas a ${num(horas)}`);
    return this.telegram.enviar(chatId, t, botones);
  }

  /** Botones fh, fp/FP, fe/FE, fx, fa/FA, fm. Devuelve false si no es suyo */
  async boton(accion: string, id: string, chatId: number, mensajeId: number, quien: string, puede: Puede, responder: (t?: string, alerta?: boolean) => Promise<unknown>) {
    const sinPermiso = () => responder('No tienes permiso para esto', true);
    switch (accion) {
      case 'fm':
        if (!puede('POST', '/facturas/facturar-mes')) return sinPermiso();
        await responder();
        return this.empezar(chatId, id, puede);

      case 'fh':
        await responder();
        return this.preguntarHoras(chatId, id);

      // Primer toque: confirmar. Segundo (mayúsculas): hacerlo
      case 'fp':
      case 'fe': {
        const { f, texto } = await this.tarjeta(id, puede);
        if (f.estado !== 'borrador') return responder('Esta ya está emitida', true);
        await responder();
        const pregunta =
          accion === 'fp'
            ? `📝 ¿Mandar la <b>prefactura</b> a ${html(f.cliente?.email)} para que dé el visto bueno?`
            : `📤 ¿<b>Emitir</b> la factura y mandarla a ${html(f.cliente?.email)}?\nRecibirá su número oficial y ya no se podrá borrar.`;
        return this.telegram.editar(chatId, mensajeId, `${texto}\n\n${pregunta}`, [
          [{ text: accion === 'fp' ? '📝 Sí, mandarla' : '📤 Sí, emitir y enviar', callback_data: `${accion.toUpperCase()}:${id}` }, { text: 'Cancelar', callback_data: `fx:${id}` }],
        ]);
      }

      case 'fx': {
        await responder('Cancelado');
        const { texto, botones } = await this.tarjeta(id, puede);
        return this.telegram.editar(chatId, mensajeId, texto, botones);
      }

      case 'FP': {
        if (!puede('POST', '/cobros/enviar-factura')) return sinPermiso();
        const r = await this.envio.enviar(id);
        await responder('📝 Prefactura enviada');
        const { texto, botones } = await this.tarjeta(id, puede, `📝 <b>Prefactura enviada</b> a ${html(r.para)} (${html(quien)})${r.modo === 'prueba' ? ' · modo prueba, no ha salido' : ''}`);
        return this.telegram.editar(chatId, mensajeId, texto, botones);
      }

      case 'FE': {
        if (!puede('POST', `/facturas/${id}/emitir`) || !puede('POST', '/cobros/enviar-factura')) return sinPermiso();
        const nota = await this.emitirYEnviar(id, quien);
        await responder('📤 Hecho');
        const { texto, botones } = await this.tarjeta(id, puede, nota);
        return this.telegram.editar(chatId, mensajeId, texto, botones);
      }

      case 'fa': {
        const ids = await this.prefacturasPendientes(id);
        if (!ids.length) return responder('No queda ninguna prefactura por emitir este mes', true);
        await responder();
        return this.telegram.editar(
          chatId,
          mensajeId,
          `📤 ¿<b>Emitir y enviar las ${ids.length} facturas</b> de ${nombreMes(id)}?\nCada cliente recibirá la suya con su número oficial. Ya no se podrán borrar.`,
          [[{ text: `📤 Sí, emitir y enviar las ${ids.length}`, callback_data: `FA:${id}` }, { text: 'Cancelar', callback_data: `fz:${id}` }]],
        );
      }

      case 'fz':
        await responder('Cancelado');
        return this.telegram.editar(chatId, mensajeId, `📋 Facturación de ${nombreMes(id)}: no se ha enviado nada.`, [[{ text: '📤 Emitir y enviar todas', callback_data: `fa:${id}` }]]);

      case 'FA': {
        if (!puede('POST', '/facturas/facturar-mes') || !puede('POST', '/cobros/enviar-factura')) return sinPermiso();
        const ids = await this.prefacturasPendientes(id);
        await responder(`Emitiendo ${ids.length}…`);
        const lineas: string[] = [];
        for (const fid of ids) {
          const f = await this.cargar(fid);
          lineas.push(`• ${html(f.proyecto?.nombre ?? '')}: ${await this.emitirYEnviar(fid, quien, false)}`);
        }
        return this.telegram.editar(chatId, mensajeId, [`📤 <b>Facturación de ${nombreMes(id)}</b> (${html(quien)})`, '', ...lineas].join('\n'), [
          [this.telegram.abrir('Ver facturas', '/facturas')],
        ]);
      }
    }
    return false;
  }

  /** Prefacturas del mes de proyectos activos que siguen sin emitir y cuyo cliente tiene correo */
  private async prefacturasPendientes(periodo: string) {
    const proyectos = (await this.facturas.pendientesMes(periodo)).filter((o) => !o.factura_id && o.prefactura_id);
    const ids = proyectos.map((o) => o.prefactura_id as string);
    if (!ids.length) return [];
    const conCorreo = (ok(await this.db.from('facturas').select('id, cliente:clientes(email)').in('id', ids)) ?? []) as any[];
    return conCorreo.filter((f) => f.cliente?.email).map((f) => f.id as string);
  }

  /** Emite y envía; si el correo falla, la factura queda emitida y se dice claramente */
  private async emitirYEnviar(id: string, quien: string, largo = true) {
    const emitida = await this.facturas.emitir(id);
    try {
      const r = await this.envio.enviar(id);
      const prueba = r.modo === 'prueba' ? ' · modo prueba, no ha salido' : '';
      return largo ? `📤 <b>Factura ${html(emitida.numero)} emitida y enviada</b> a ${html(r.para)} (${html(quien)})${prueba}` : `✅ factura ${html(emitida.numero)} enviada a ${html(r.para)}${prueba}`;
    } catch (e: any) {
      this.log.error(`Factura ${emitida.numero} emitida pero sin enviar: ${e.message}`);
      return largo
        ? `⚠️ <b>Factura ${html(emitida.numero)} emitida</b>, pero el correo no ha salido: ${html(e.message)}. Envíala desde la app.`
        : `⚠️ factura ${html(emitida.numero)} emitida, correo sin enviar (${html(e.message)})`;
    }
  }
}
