import { BadRequestException, Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { Response } from 'express';
import ExcelJS from 'exceljs';
import { redondear } from '@stella/shared';
import { SUPABASE } from '../comun/supabase.module';
import { ok } from '../comun/db';

/** Umbral del modelo 347: operaciones con un mismo cliente por encima de esto en el año */
const UMBRAL_347 = 3005.06;

const rango = (anio: number, trimestre?: number) => {
  const desde = trimestre ? `${anio}-${String((trimestre - 1) * 3 + 1).padStart(2, '0')}-01` : `${anio}-01-01`;
  const hastaMes = trimestre ? trimestre * 3 : 12;
  const hasta = new Date(Date.UTC(anio, hastaMes, 0)).toISOString().slice(0, 10);
  return { desde, hasta };
};

const trimestreDe = (fecha: string) => Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1;
const nombreCompleto = (e: any) => `${e?.nombre ?? ''} ${e?.apellidos ?? ''}`.trim();

function leerPeriodo(anio?: string, trimestre?: string) {
  const a = Number(anio);
  const t = trimestre ? Number(trimestre) : undefined;
  if (!a || a < 2000 || a > 2100) throw new BadRequestException('Elige el año');
  if (t !== undefined && ![1, 2, 3, 4].includes(t)) throw new BadRequestException('El trimestre va del 1 al 4');
  return { anio: a, trimestre: t };
}

/** Lo que la gestoría necesita cada trimestre (303, 111) y cada año (347) */
@Controller('gestoria')
export class GestoriaController {
  constructor(@Inject(SUPABASE) private readonly db: SupabaseClient) {}

  // Las facturas en borrador no existen para Hacienda; las anuladas salen en el libro pero no suman
  private async facturas(desde: string, hasta: string) {
    return ok(
      await this.db
        .from('facturas')
        .select('numero, fecha, estado, cobrada_en, base, iva_pct, iva_importe, retencion_importe, total, cliente:clientes(id, nombre, cif, cp, provincia), proyecto:proyectos(nombre)')
        .neq('estado', 'borrador')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha')
        .order('created_at'),
    ) as any[];
  }

  private async nominas(desde: string, hasta: string) {
    return ok(
      await this.db
        .from('nominas')
        .select('periodo, bruto, ss_trabajador, irpf, neto, ss_empresa, coste_empresa, estado, empleado:empleados(nombre, apellidos, dni, nss)')
        .gte('periodo', desde)
        .lte('periodo', hasta)
        .order('periodo'),
    ) as any[];
  }


  private resumir(facturas: any[], nominas: any[]) {
    const validas = facturas.filter((f) => f.estado !== 'anulada');
    const conIva = validas;
    const suma = (lista: any[], campo: string) => redondear(lista.reduce((s, x) => s + Number(x[campo]), 0));

    // IVA repercutido agrupado por tipo (21 %, 10 %…)
    const porTipo = new Map<number, { base: number; cuota: number }>();
    for (const f of conIva) {
      const t = porTipo.get(Number(f.iva_pct)) ?? { base: 0, cuota: 0 };
      t.base += Number(f.base);
      t.cuota += Number(f.iva_importe);
      porTipo.set(Number(f.iva_pct), t);
    }

    return {
      facturas: {
        numero: validas.length,
        anuladas: facturas.length - validas.length,
        base_total: suma(validas, 'base'),
        iva_por_tipo: [...porTipo.entries()].map(([tipo, v]) => ({ tipo, base: redondear(v.base), cuota: redondear(v.cuota) })),
        iva_total: suma(conIva, 'iva_importe'),
        retenciones_irpf: suma(validas, 'retencion_importe'),
        total: suma(validas, 'total'),
        pendiente_cobro: suma(validas.filter((f) => f.estado === 'emitida'), 'total'),
      },
      nominas: {
        numero: nominas.length,
        perceptores: new Set(nominas.map((n) => n.empleado?.dni ?? nombreCompleto(n.empleado))).size,
        bruto: suma(nominas, 'bruto'),
        irpf: suma(nominas, 'irpf'),
        ss_trabajador: suma(nominas, 'ss_trabajador'),
        ss_empresa: suma(nominas, 'ss_empresa'),
        neto: suma(nominas, 'neto'),
        coste_empresa: suma(nominas, 'coste_empresa'),
      },
    };
  }

  @Get('resumen')
  async resumen(@Query('anio') anio?: string, @Query('trimestre') trimestre?: string) {
    const p = leerPeriodo(anio, trimestre);
    const { desde, hasta } = rango(p.anio, p.trimestre);
    const [facturas, nominas] = await Promise.all([this.facturas(desde, hasta), this.nominas(desde, hasta)]);
    return { ...p, desde, hasta, ...this.resumir(facturas, nominas) };
  }

  @Get('347')
  async modelo347(@Query('anio') anio?: string) {
    const { anio: a } = leerPeriodo(anio);
    const { desde, hasta } = rango(a);
    const facturas = await this.facturas(desde, hasta);
    const filas = new Map<string, any>();
    const sumar = (clave: string, base: any, f: { fecha: string; base: number; iva_importe: number }) => {
      const fila = filas.get(clave) ?? { ...base, total: 0, t1: 0, t2: 0, t3: 0, t4: 0 };
      // En el 347 cuenta la operación completa (base + IVA), sin restar retenciones
      const importe = Number(f.base) + Number(f.iva_importe);
      fila.total += importe;
      fila[`t${trimestreDe(f.fecha)}`] += importe;
      filas.set(clave, fila);
    };
    for (const f of facturas.filter((x) => x.estado !== 'anulada')) {
      const c = f.cliente;
      sumar(`c:${c.id}`, { clave: 'B', tipo: 'Cliente', nif: c.cif, nombre: c.nombre, provincia: c.cp?.slice(0, 2) ?? '' }, f);
    }
    const todos = [...filas.values()].map((f) => ({
      ...f,
      total: redondear(f.total), t1: redondear(f.t1), t2: redondear(f.t2), t3: redondear(f.t3), t4: redondear(f.t4),
      declarar: f.total > UMBRAL_347,
    }));
    return { anio: a, umbral: UMBRAL_347, clientes: todos.sort((x, y) => y.total - x.total) };
  }

  @Get('excel')
  async excel(@Res() res: Response, @Query('anio') anio?: string, @Query('trimestre') trimestre?: string) {
    const p = leerPeriodo(anio, trimestre);
    const { desde, hasta } = rango(p.anio, p.trimestre);
    const [facturas, nominas, empresa] = await Promise.all([
      this.facturas(desde, hasta),
      this.nominas(desde, hasta),
      this.db.from('empresa').select('nombre, cif').eq('id', 1).single().then((r) => ok(r) as any),
    ]);
    const r = this.resumir(facturas, nominas);
    const periodo = p.trimestre ? `${p.trimestre}T ${p.anio}` : `${p.anio}`;

    const libro = nuevoLibro(empresa);
    const hojaResumen = libro.addWorksheet('Resumen');
    hojaResumen.columns = [{ width: 52 }, { width: 18 }];
    titulo(hojaResumen, `${empresa.nombre} · ${empresa.cif ?? ''} · ${periodo}`);
    const filas: [string, number | string][] = [
      ['FACTURAS EMITIDAS (para el modelo 303)', ''],
      ['Número de facturas', r.facturas.numero],
      ...r.facturas.iva_por_tipo.flatMap((t): [string, number][] => [
        [`Base imponible al ${t.tipo} %`, t.base],
        [`Cuota de IVA al ${t.tipo} %`, t.cuota],
      ]),
      ['Total IVA repercutido', r.facturas.iva_total],
      ['Retenciones de IRPF practicadas por clientes', r.facturas.retenciones_irpf],
      ['Pendiente de cobro', r.facturas.pendiente_cobro],
      ['', ''],
      ['NÓMINAS (para el modelo 111 y la Seguridad Social)', ''],
      ['Número de perceptores', r.nominas.perceptores],
      ['Salario bruto', r.nominas.bruto],
      ['Retenciones de IRPF', r.nominas.irpf],
      ['Seguridad Social a cargo del trabajador', r.nominas.ss_trabajador],
      ['Seguridad Social a cargo de la empresa', r.nominas.ss_empresa],
      ['Coste total de personal', r.nominas.coste_empresa],
    ];
    for (const [t, v] of filas) {
      const fila = hojaResumen.addRow([t, v]);
      if (typeof v === 'number' && !t.startsWith('Número')) fila.getCell(2).numFmt = EUROS;
      if (t === t.toUpperCase() && t) fila.font = { bold: true, color: { argb: 'FF1F6FEB' } };
    }
    hojaResumen.addRow([]);
    hojaResumen.addRow(['Importes calculados por Stella ERP. Las nóminas son una estimación: revisadlas con las oficiales.']).font = { italic: true, color: { argb: 'FF667085' } };

    tabla(libro, 'Facturas emitidas', [
      ['Fecha', 12, 'fecha'], ['Número', 12], ['Cliente', 36], ['NIF', 13], ['Proyecto', 30], ['Base', 14, EUROS], ['IVA %', 8],
      ['Cuota IVA', 14, EUROS], ['Retención IRPF', 14, EUROS], ['Total', 14, EUROS], ['Estado', 12], ['Cobrada el', 12, 'fecha'],
    ], facturas.map((f) => [
      fechaExcel(f.fecha), f.numero, f.cliente?.nombre, f.cliente?.cif, f.proyecto?.nombre ?? '', Number(f.base), Number(f.iva_pct),
      Number(f.iva_importe), Number(f.retencion_importe), Number(f.total),
      { emitida: 'Pendiente', cobrada: 'Cobrada', anulada: 'Anulada' }[f.estado as string] ?? f.estado, fechaExcel(f.cobrada_en),
    ]));

    tabla(libro, 'Nóminas', [
      ['Mes', 12, 'mm/yyyy'], ['Empleado', 30], ['DNI', 12], ['Nº S. Social', 16], ['Bruto', 13, EUROS], ['S. Social trabajador', 14, EUROS],
      ['IRPF', 13, EUROS], ['Neto', 13, EUROS], ['S. Social empresa', 14, EUROS], ['Coste empresa', 14, EUROS], ['Estado', 11],
    ], nominas.map((n) => [
      fechaExcel(n.periodo), nombreCompleto(n.empleado), n.empleado?.dni, n.empleado?.nss, Number(n.bruto), Number(n.ss_trabajador),
      Number(n.irpf), Number(n.neto), Number(n.ss_empresa), Number(n.coste_empresa), n.estado === 'pagada' ? 'Pagada' : 'Pendiente',
    ]));

    await enviarLibro(res, libro, `Gestoria ${periodo}.xlsx`);
  }

  @Get('347/excel')
  async excel347(@Res() res: Response, @Query('anio') anio?: string) {
    const { anio: a, umbral, clientes } = await this.modelo347(anio);
    const empresa = await this.db.from('empresa').select('nombre, cif').eq('id', 1).single().then((r) => ok(r) as any);
    const libro = nuevoLibro(empresa);
    tabla(libro, `Modelo 347 ${a}`, [
      ['Clave', 7], ['Tipo', 10], ['NIF', 13], ['Nombre', 40], ['Provincia (código)', 10], ['Importe anual', 15, EUROS], ['1T', 13, EUROS], ['2T', 13, EUROS],
      ['3T', 13, EUROS], ['4T', 13, EUROS], ['¿Se declara?', 11],
    ], clientes.map((c) => [c.clave, c.tipo, c.nif, c.nombre, c.provincia, c.total, c.t1, c.t2, c.t3, c.t4, c.declarar ? 'Sí' : 'No']));
    const hoja = libro.getWorksheet(`Modelo 347 ${a}`)!;
    hoja.addRow([]);
    hoja.addRow([`Se declaran los clientes con más de ${umbral.toLocaleString('es-ES')} € en el año (IVA incluido). Clave B = ventas a clientes.`]).font = { italic: true, color: { argb: 'FF667085' } };
    await enviarLibro(res, libro, `Modelo 347 ${a}.xlsx`);
  }
}

// ───────────── Ayudantes de Excel ─────────────

export const EUROS = '#,##0.00 "€"';

export function nuevoLibro(empresa: { nombre: string }) {
  const libro = new ExcelJS.Workbook();
  libro.creator = `Stella ERP · ${empresa.nombre}`;
  libro.created = new Date();
  return libro;
}

function titulo(hoja: ExcelJS.Worksheet, texto: string) {
  hoja.addRow([texto]).font = { bold: true, size: 13 };
  hoja.addRow([]);
}

export const fechaExcel = (f?: string | null) => (f ? new Date(`${f.slice(0, 10)}T12:00:00Z`) : null);

export function tabla(libro: ExcelJS.Workbook, nombre: string, columnas: [string, number, string?][], filas: unknown[][]) {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = columnas.map(([header, width, formato]) => ({
    header,
    width,
    style: formato ? { numFmt: formato === 'fecha' ? 'dd/mm/yyyy' : formato } : {},
  }));
  const cabecera = hoja.getRow(1);
  cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6FEB' } };
  cabecera.alignment = { vertical: 'middle', wrapText: true };
  cabecera.height = 30;
  hoja.addRows(filas);
  if (filas.length) hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
}

export async function enviarLibro(res: Response, libro: ExcelJS.Workbook, nombre: string) {
  const buffer = await libro.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  res.send(Buffer.from(buffer));
}
