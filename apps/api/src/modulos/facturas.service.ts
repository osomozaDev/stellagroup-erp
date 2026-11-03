import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  calcularTotales,
  calcularVencimiento,
  ESTADOS_FACTURA,
  EstadoFactura,
  FacturaInput,
  FacturarMesInput,
  nombreMes,
  primerDiaMes,
  RectificarInput,
  redondear,
  semanasDelMes,
} from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';
import { html, TelegramService } from '../comun/telegram.service';

const eurosTexto = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n);

/** '2026-05-01' → '2026-05-31' */
const finDeMes = (periodo: string) => {
  const [a, m] = periodo.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

/** Meses (primer día) entre dos fechas, ambos incluidos */
const mesesEntre = (desde: string, hasta: string) => {
  const meses: string[] = [];
  let [a, m] = desde.split('-').map(Number);
  const fin = primerDiaMes(hasta);
  for (;;) {
    const p = `${a}-${String(m).padStart(2, '0')}-01`;
    if (p > fin) return meses;
    meses.push(p);
    if (++m > 12) [a, m] = [a + 1, 1];
  }
};

@Injectable()
export class FacturasService {
  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly telegram: TelegramService,
  ) {}

  /** Factura completa, con empresa, cliente, proyecto, líneas y rectificativas: lo que necesitan la ficha y el PDF */
  async ver(id: string): Promise<any> {
    const factura = ok(
      await this.db
        .from('facturas')
        .select('*, cliente:clientes(*), proyecto:proyectos(id, nombre, referencia), lineas:factura_lineas(*)')
        .eq('id', id)
        .order('orden', { referencedTable: 'factura_lineas' })
        .single(),
    );
    const [empresa, rectificada, rectificativas] = await Promise.all([
      this.db.from('empresa').select('*').eq('id', 1).single().then((r) => ok(r)),
      // A qué factura corrige (si es rectificativa) y qué rectificativas tiene (si es original)
      factura.rectifica_id
        ? this.db.from('facturas').select('id, numero, fecha').eq('id', factura.rectifica_id).single().then((r) => ok(r))
        : null,
      this.db.from('facturas').select('id, numero, fecha, total, motivo_rectificacion').eq('rectifica_id', id).order('fecha').then((r) => ok(r)),
    ]);
    return { ...factura, empresa, rectificada, rectificativas };
  }

  /** Cobrada, por cobrar o anulada. Desde la app y desde los botones de Telegram (quien = nombre del que lo pulsa) */
  async cambiarEstado(id: string, estado: EstadoFactura, origen: { quien?: string | null; exceptoChat?: number } = {}) {
    const { quien } = origen;
    if (!ESTADOS_FACTURA.includes(estado) || estado === 'borrador') throw new BadRequestException('Estado no válido');
    const actual = ok(await this.db.from('facturas').select('estado, numero, total, rectifica_id, cliente:clientes(nombre)').eq('id', id).single()) as any;
    if (actual?.estado === 'borrador') throw new BadRequestException('Primero hay que emitir la prefactura');
    const cobrada_en = estado === 'cobrada' ? new Date().toISOString().slice(0, 10) : null;
    const f = ok(await this.db.from('facturas').update({ estado, cobrada_en }).eq('id', id).select().single());
    // Cobrar una factura salda también sus rectificativas pendientes (el cliente paga la diferencia)
    if (estado === 'cobrada') ok(await this.db.from('facturas').update({ estado, cobrada_en }).eq('rectifica_id', id).eq('estado', 'emitida'));
    if (estado === 'cobrada' && actual.estado !== 'cobrada' && !actual.rectifica_id) {
      await this.telegram.avisar(
        'cobradas',
        `💶 <b>Cobrada</b>${quien ? ` · la ha marcado ${html(quien)}` : ''}\n<a href="${this.telegram.web}/facturas/${id}">Factura ${html(actual.numero)} · ${html(actual.cliente?.nombre)}</a>\n${eurosTexto(Number(actual.total))}`,
        // Quien lo marca desde Telegram ya lo ve en su mensaje: no se le avisa otra vez
        { botones: [[{ text: '↩️ Deshacer', callback_data: `d:${id}` }], [this.telegram.abrir('Abrir factura', `/facturas/${id}`)]], excepto: origen.exceptoChat },
      );
    }
    return f;
  }

  private async empresa() {
    return ok(await this.db.from('empresa').select('*').eq('id', 1).single());
  }

  private filaFactura(input: FacturaInput) {
    const t = calcularTotales(input.lineas, input.iva_pct, input.retencion_pct);
    const { lineas, borrador: _borrador, ...cabecera } = input;
    return {
      cabecera: { ...cabecera, periodo: input.periodo ? primerDiaMes(input.periodo) : null, ...t },
      lineas: lineas.map((l, i) => ({ ...l, orden: i, importe: redondear(l.cantidad * l.precio) })),
    };
  }

  /**
   * Coge el siguiente número correlativo. Solo se llama al emitir: los borradores no gastan número.
   * El vencimiento sale de la condición de pago del cliente (o de la general de la empresa).
   */
  private async numerar(fecha: string, clienteId: string) {
    const empresa = await this.empresa();
    const cliente = ok(await this.db.from('clientes').select('pago_tipo, pago_valor').eq('id', clienteId).single());
    const serie = empresa.serie_factura ?? '';
    const anio = Number(fecha.slice(0, 4));
    const numero = ok(await this.db.rpc('siguiente_numero_factura', { p_serie: serie, p_anio: anio })) as string;
    const { count: repetida } = await this.db.from('facturas').select('id', { count: 'exact', head: true }).eq('numero', numero);
    if (repetida) throw new BadRequestException(`Ya existe la factura ${numero}. Revisa el próximo número en «Mi empresa».`);
    return { numero, serie, anio, vencimiento: calcularVencimiento(fecha, cliente, empresa.dias_vencimiento) };
  }

  /** Guarda algo que ya tiene número; si falla, devuelve el número para no dejar huecos */
  private async conNumero<T>(n: { numero: string | null; serie: string | null; anio: number | null }, guardar: () => Promise<T>): Promise<T> {
    try {
      return await guardar();
    } catch (e) {
      if (n.numero) await this.db.rpc('liberar_numero_factura', { p_serie: n.serie ?? '', p_anio: n.anio, p_numero: n.numero });
      throw e;
    }
  }

  async crear(input: FacturaInput) {
    const { cabecera, lineas } = this.filaFactura(input);

    if (cabecera.proyecto_id && cabecera.periodo) {
      const { count } = await this.db
        .from('facturas')
        .select('id', { count: 'exact', head: true })
        .eq('proyecto_id', cabecera.proyecto_id)
        .eq('periodo', cabecera.periodo)
        .neq('estado', 'anulada');
      if (count) throw new BadRequestException(`Este proyecto ya tiene factura o prefactura de ${nombreMes(cabecera.periodo)}`);
    }

    const fila: Record<string, unknown> = input.borrador
      ? { ...cabecera, estado: 'borrador', numero: null, serie: null, anio: null }
      : await this.numerar(input.fecha, input.cliente_id).then(({ vencimiento, ...n }) => ({
          ...cabecera,
          ...n,
          vencimiento: cabecera.vencimiento ?? vencimiento,
          estado: 'emitida',
        }));
    const factura = await this.conNumero(fila as any, async () => ok(await this.db.from('facturas').insert(fila).select().single()));
    ok(await this.db.from('factura_lineas').insert(lineas.map((l) => ({ ...l, factura_id: factura.id }))));
    return factura;
  }

  async editar(id: string, input: FacturaInput) {
    const actual = ok(await this.db.from('facturas').select('estado').eq('id', id).single());
    if (actual?.estado === 'anulada') throw new BadRequestException('Una factura anulada no se puede editar');
    const { cabecera, lineas } = this.filaFactura(input);
    const factura = ok(await this.db.from('facturas').update(cabecera).eq('id', id).select().single());
    ok(await this.db.from('factura_lineas').delete().eq('factura_id', id));
    ok(await this.db.from('factura_lineas').insert(lineas.map((l) => ({ ...l, factura_id: id }))));
    return factura;
  }

  /** Convierte una prefactura en factura: le da número, fecha y vencimiento */
  async emitir(id: string, fecha?: string) {
    const f = ok(await this.db.from('facturas').select('estado, fecha, cliente_id').eq('id', id).single());
    if (f?.estado !== 'borrador') throw new BadRequestException('Esta factura ya está emitida');
    const fechaFactura = fecha || f.fecha;
    const n = await this.numerar(fechaFactura, f.cliente_id);
    return ok(
      await this.db
        .from('facturas')
        .update({ ...n, fecha: fechaFactura, estado: 'emitida' })
        .eq('id', id)
        .eq('estado', 'borrador')
        .select()
        .single(),
    );
  }

  /**
   * Emite una rectificativa (serie R) de una factura emitida o cobrada.
   * Anulación total: líneas en negativo. Por diferencias: resta lo original y suma lo correcto.
   * Si anula entera una factura sin cobrar, las dos quedan saldadas y salen de lo pendiente.
   */
  async rectificar(id: string, input: RectificarInput) {
    const o = ok(await this.db.from('facturas').select('*, lineas:factura_lineas(*)').eq('id', id).order('orden', { referencedTable: 'factura_lineas' }).single()) as any;
    if (o.estado !== 'emitida' && o.estado !== 'cobrada') throw new BadRequestException('Solo se pueden rectificar facturas emitidas');
    if (o.rectifica_id) throw new BadRequestException('Esta ya es una rectificativa. Rectifica la factura original.');

    const original = (o.lineas as any[]).map((l) => ({ concepto: `Anula: ${l.concepto}`, cantidad: -Number(l.cantidad), unidad: l.unidad, precio: Number(l.precio) }));
    const correctas = input.lineas_correctas?.length ? input.lineas_correctas : [];
    const lineas = [...original, ...correctas];
    const total = !correctas.length;
    const t = calcularTotales(lineas, Number(o.iva_pct), Number(o.retencion_pct));
    if (t.base === 0) throw new BadRequestException('Las líneas correctas son iguales que las de la factura: no hay nada que rectificar');

    const serie = 'R';
    const anio = Number(input.fecha.slice(0, 4));
    const numero = ok(await this.db.rpc('siguiente_numero_factura', { p_serie: serie, p_anio: anio })) as string;
    const hoy = new Date().toISOString().slice(0, 10);
    // Anular entera una factura que no se había cobrado: no queda nada pendiente con el cliente
    const saldada = total && o.estado === 'emitida';

    const r = await this.conNumero({ numero, serie, anio }, async () => ok(
      await this.db
        .from('facturas')
        .insert({
          numero, serie, anio,
          fecha: input.fecha,
          vencimiento: null,
          cliente_id: o.cliente_id,
          proyecto_id: o.proyecto_id,
          periodo: o.periodo,
          iva_pct: o.iva_pct,
          retencion_pct: o.retencion_pct,
          notas: null,
          rectifica_id: o.id,
          motivo_rectificacion: input.motivo,
          estado: saldada ? 'cobrada' : 'emitida',
          cobrada_en: saldada ? hoy : null,
          ...t,
        })
        .select()
        .single(),
    ) as any);
    ok(
      await this.db
        .from('factura_lineas')
        .insert(lineas.map((l, i) => ({ ...l, orden: i, importe: redondear(l.cantidad * l.precio), factura_id: r.id }))),
    );
    if (saldada) ok(await this.db.from('facturas').update({ estado: 'cobrada', cobrada_en: hoy }).eq('id', o.id));
    return r;
  }

  async borrarBorrador(id: string) {
    const f = ok(await this.db.from('facturas').select('estado').eq('id', id).single());
    if (f?.estado !== 'borrador') throw new BadRequestException('Solo se pueden borrar prefacturas. Las facturas emitidas se anulan.');
    ok(await this.db.from('facturas').delete().eq('id', id));
    return { ok: true };
  }

  /**
   * Factura (o prefactura) de un hito: una línea con el hito y el proyecto. Un hito
   * solo se factura una vez; si su factura se anula, se puede volver a facturar.
   */
  async facturarHito(proyectoId: string, hitoId: string, opciones: { fecha?: string; borrador?: boolean }) {
    const h = ok(await this.db.from('hitos').select('*, factura:facturas(id, numero, estado), proyecto:proyectos(*)').eq('id', hitoId).eq('proyecto_id', proyectoId).single()) as any;
    if (h.factura && h.factura.estado !== 'anulada') {
      throw new BadRequestException(`Este hito ya está en la ${h.factura.numero ? `factura ${h.factura.numero}` : 'prefactura'}`);
    }
    if (!(Number(h.importe) > 0)) throw new BadRequestException('Pon el importe del hito antes de facturarlo');
    const p = h.proyecto;
    const factura = await this.crear({
      cliente_id: p.cliente_id,
      proyecto_id: p.id,
      periodo: null,
      fecha: opciones.fecha || new Date().toISOString().slice(0, 10),
      vencimiento: null,
      iva_pct: Number(p.iva_pct),
      retencion_pct: Number(p.retencion_pct),
      notas: null,
      borrador: opciones.borrador ?? false,
      lineas: [{ concepto: `${p.nombre} — ${h.nombre}${h.descripcion ? `\n${h.descripcion}` : ''}`, cantidad: 1, unidad: 'ud', precio: Number(h.importe) }],
    });
    ok(await this.db.from('hitos').update({ factura_id: factura.id, completado_en: h.completado_en ?? factura.fecha }).eq('id', hitoId));
    return factura;
  }

  private facturaDeProyecto(proyecto: any, periodo: string, horas: number, borrador: boolean, fecha = finDeMes(periodo)): FacturaInput {
    return {
      cliente_id: proyecto.cliente_id,
      proyecto_id: proyecto.id,
      periodo,
      fecha,
      vencimiento: null,
      iva_pct: Number(proyecto.iva_pct),
      retencion_pct: Number(proyecto.retencion_pct),
      notas: null,
      borrador,
      lineas: [{ concepto: proyecto.concepto, cantidad: horas, unidad: 'h', precio: Number(proyecto.precio_hora) }],
    };
  }

  /**
   * Crea una prefactura por cada mes del proyecto (de la fecha de inicio a la de fin)
   * que aún no tenga factura. Con `actualizar`, las prefacturas que ya existían se
   * rehacen con las horas y el precio actuales del proyecto.
   */
  async generarPrefacturas(proyectoId: string, actualizar = false) {
    const proyecto = ok(await this.db.from('proyectos').select('*').eq('id', proyectoId).single());
    if (!proyecto.fecha_inicio || !proyecto.fecha_fin) {
      throw new BadRequestException('Pon la fecha de inicio y la de fin del proyecto para saber cuántos meses dura');
    }
    if (proyecto.fecha_fin < proyecto.fecha_inicio) throw new BadRequestException('La fecha de fin es anterior a la de inicio');

    const meses = mesesEntre(proyecto.fecha_inicio, proyecto.fecha_fin);
    if (meses.length > 60) throw new BadRequestException('El proyecto dura más de 5 años: revisa las fechas');

    const existentes = ok(
      await this.db.from('facturas').select('id, periodo, estado').eq('proyecto_id', proyectoId).neq('estado', 'anulada'),
    ) as any[];
    let creadas = 0;
    let actualizadas = 0;
    for (const periodo of meses) {
      const ya = existentes.find((f) => f.periodo === periodo);
      if (!ya) {
        await this.crear(this.facturaDeProyecto(proyecto, periodo, Number(proyecto.horas_mes), true));
        creadas++;
      } else if (actualizar && ya.estado === 'borrador') {
        await this.editar(ya.id, this.facturaDeProyecto(proyecto, periodo, Number(proyecto.horas_mes), true));
        actualizadas++;
      }
    }
    return { meses: meses.length, creadas, actualizadas };
  }

  /**
   * Emite la factura del mes de cada proyecto marcado. Si el proyecto tenía prefactura de
   * ese mes se usa (con las horas que se hayan puesto); si no, se crea.
   */
  async facturarMes(input: FacturarMesInput) {
    const periodo = primerDiaMes(input.periodo);
    const ids = input.proyectos.map((o) => o.proyecto_id);
    const proyectos = ok(await this.db.from('proyectos').select('*').in('id', ids)) as any[];
    const borradores = ok(
      await this.db
        .from('facturas')
        .select('*, lineas:factura_lineas(*)')
        .in('proyecto_id', ids)
        .eq('periodo', periodo)
        .eq('estado', 'borrador'),
    ) as any[];
    const creadas: any[] = [];
    const errores: string[] = [];

    for (const { proyecto_id, horas, concepto } of input.proyectos) {
      const proyecto = proyectos.find((o) => o.id === proyecto_id);
      if (!proyecto) continue;
      try {
        const borrador = borradores.find((b) => b.proyecto_id === proyecto_id);
        if (borrador) {
          const lineas = [...borrador.lineas].sort((a: any, b: any) => a.orden - b.orden);
          const nuevoConcepto = concepto ?? lineas[0]?.concepto;
          if (lineas.length && (Number(lineas[0].cantidad) !== horas || lineas[0].concepto !== nuevoConcepto)) {
            await this.editar(borrador.id, {
              cliente_id: borrador.cliente_id,
              proyecto_id: borrador.proyecto_id,
              periodo,
              fecha: borrador.fecha,
              vencimiento: null,
              iva_pct: Number(borrador.iva_pct),
              retencion_pct: Number(borrador.retencion_pct),
              notas: borrador.notas,
              borrador: true,
              lineas: lineas.map((l: any, i: number) => ({
                concepto: i === 0 ? nuevoConcepto : l.concepto,
                unidad: l.unidad,
                precio: Number(l.precio),
                cantidad: i === 0 ? horas : Number(l.cantidad),
              })),
            });
          }
          creadas.push(await this.emitir(borrador.id, input.fecha));
        } else {
          const factura = this.facturaDeProyecto(proyecto, periodo, horas, false, input.fecha);
          if (concepto) factura.lineas[0].concepto = concepto;
          creadas.push(await this.crear(factura));
        }
      } catch (e: any) {
        errores.push(`${proyecto.nombre}: ${e.message}`);
      }
    }
    return { creadas: creadas.length, facturas: creadas, errores };
  }

  /**
   * Para facturar el mes desde Telegram: la prefactura de cada proyecto activo que aún no
   * tiene factura este mes. Las que faltan se crean con las horas y el detalle que
   * propondría la pantalla «Facturar el mes».
   */
  async prefacturasMes(periodoTexto: string) {
    const periodo = primerDiaMes(periodoTexto);
    const proyectos = (await this.pendientesMes(periodo)).filter((o) => !o.factura_id);
    const ids: string[] = [];
    const errores: string[] = [];
    for (const o of proyectos) {
      if (o.prefactura_id) {
        // La prefactura se generó con las horas habituales: se ponen las del registro semanal
        if (o.horas_origen === 'registro' && Number(o.horas_prefactura) !== Number(o.horas_mes)) await this.cambiarHorasBorrador(o.prefactura_id, Number(o.horas_mes));
        ids.push(o.prefactura_id);
        continue;
      }
      try {
        // pendientesMes ya trae en «concepto» el detalle propuesto (el del mes anterior si lo hay)
        const nueva = await this.crear(this.facturaDeProyecto({ ...o, cliente_id: o.cliente?.id }, periodo, Number(o.horas_mes), true));
        ids.push(nueva.id);
      } catch (e: any) {
        errores.push(`${o.nombre}: ${e.message}`);
      }
    }
    return { ids, errores };
  }

  /**
   * Horas que se proponen para el mes: si se han apuntado semanas, su suma; si no,
   * las de la prefactura y, si no la hay, las habituales del proyecto.
   */
  private horasPropuestas(o: any, horasPrefactura: number | undefined, semanas: any[]) {
    const horas_semanas = semanas.length;
    if (horas_semanas) return { horas_semanas, horas_mes: semanas.reduce((t, h) => t + Number(h.horas), 0), horas_origen: 'registro' };
    return { horas_semanas, horas_mes: horasPrefactura ?? o.horas_mes, horas_origen: horasPrefactura != null ? 'prefactura' : 'proyecto' };
  }

  /** Cambia las horas de la primera línea de una prefactura (el resto de líneas se queda igual) */
  async cambiarHorasBorrador(id: string, horas: number) {
    const b = ok(await this.db.from('facturas').select('*, lineas:factura_lineas(*)').eq('id', id).single()) as any;
    if (b.estado !== 'borrador') throw new BadRequestException('Ya está emitida: las horas se cambian rectificándola');
    const lineas = [...b.lineas].sort((x: any, y: any) => x.orden - y.orden);
    return this.editar(id, {
      cliente_id: b.cliente_id,
      proyecto_id: b.proyecto_id,
      periodo: b.periodo,
      fecha: b.fecha,
      vencimiento: null,
      iva_pct: Number(b.iva_pct),
      retencion_pct: Number(b.retencion_pct),
      notas: b.notas,
      borrador: true,
      lineas: lineas.map((l: any, i: number) => ({ concepto: l.concepto, unidad: l.unidad, precio: Number(l.precio), cantidad: i === 0 ? horas : Number(l.cantidad) })),
    });
  }

  /**
   * Proyectos activas con lo que toca facturar este mes: si ya está emitida o si hay prefactura.
   * El detalle propuesto es el de la prefactura, si no el de la última factura del proyecto
   * (cada mes solo cambia un poco) y, si es la primera, el concepto del proyecto.
   */
  async pendientesMes(periodoTexto: string) {
    const periodo = primerDiaMes(periodoTexto);
    const proyectos = ok(
      await this.db
        .from('proyectos')
        .select('id, nombre, referencia, concepto, horas_mes, precio_hora, iva_pct, retencion_pct, cliente:clientes(id, nombre)')
        .eq('estado', 'activo').eq('modalidad', 'horas')
        .order('nombre'),
    ) as any[];
    const delMes = ok(
      await this.db
        .from('facturas')
        .select('id, proyecto_id, numero, estado, lineas:factura_lineas(cantidad, concepto, orden)')
        .eq('periodo', periodo)
        .neq('estado', 'anulada'),
    ) as any[];
    const anteriores = ok(
      await this.db
        .from('facturas')
        .select('proyecto_id, periodo, lineas:factura_lineas(concepto, orden)')
        .in('proyecto_id', proyectos.map((o) => o.id))
        .in('estado', ['emitida', 'cobrada'])
        .lt('periodo', periodo)
        .order('periodo', { ascending: false }),
    ) as any[];
    const registradas = ok(
      await this.db
        .from('horas_semana')
        .select('proyecto_id, horas')
        .in('proyecto_id', proyectos.map((o) => o.id))
        .gte('inicio', periodo)
        .lte('inicio', finDeMes(periodo)),
    ) as any[];
    const semanasMes = semanasDelMes(periodo).length;
    const primeraLinea = (f: any) => f?.lineas?.sort((x: any, y: any) => x.orden - y.orden)[0];
    return proyectos.map((o) => {
      const f = delMes.find((h) => h.proyecto_id === o.id && h.estado !== 'borrador');
      const b = delMes.find((h) => h.proyecto_id === o.id && h.estado === 'borrador');
      const horasPrefactura = primeraLinea(b)?.cantidad;
      const anterior = anteriores.find((a) => a.proyecto_id === o.id);
      // Una prefactura sin tocar lleva el concepto general del proyecto: ahí manda el mes anterior
      const prefacturaEditada = primeraLinea(b) && primeraLinea(b).concepto !== o.concepto;
      const [concepto, concepto_origen] = prefacturaEditada
        ? [primeraLinea(b).concepto, 'prefactura']
        : primeraLinea(anterior)
          ? [primeraLinea(anterior).concepto, 'mes_anterior']
          : [o.concepto, 'proyecto'];
      return {
        ...o,
        concepto,
        concepto_origen,
        concepto_mes_anterior: anterior?.periodo ?? null,
        factura_id: f?.id ?? null,
        factura_numero: f?.numero ?? null,
        prefactura_id: b?.id ?? null,
        horas_prefactura: horasPrefactura ?? null,
        ...this.horasPropuestas(o, horasPrefactura, registradas.filter((h) => h.proyecto_id === o.id)),
        semanas_mes: semanasMes,
      };
    });
  }
}
