import { z } from 'zod';

// ───────────── Utilidades ─────────────

export const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** '2026-10' o '2026-10-15' → '2026-10-01' */
export const primerDiaMes = (fecha: string) => `${fecha.slice(0, 7)}-01`;

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** '2026-10-01' → 'octubre 2026' */
export const nombreMes = (periodo: string) => {
  const [a, m] = periodo.split('-');
  return `${MESES[Number(m) - 1]} ${a}`;
};

/**
 * Semanas de un mes cortadas a sus límites: la primera empieza el día 1 y la última
 * acaba el último día. '2026-10' → [{ inicio: '2026-10-01', fin: '2026-10-04' }, { inicio: '2026-10-05', … }]
 */
export const semanasDelMes = (periodo: string) => {
  const [a, m] = periodo.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const iso = (d: number) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const semanas: { inicio: string; fin: string }[] = [];
  for (let d = 1; d <= ultimo; ) {
    // getUTCDay: 0 = domingo; la semana acaba en domingo
    const hastaDomingo = (7 - new Date(Date.UTC(a, m - 1, d)).getUTCDay()) % 7;
    const fin = Math.min(d + hastaDomingo, ultimo);
    semanas.push({ inicio: iso(d), fin: iso(fin) });
    d = fin + 1;
  }
  return semanas;
};

export const horasSemanaSchema = z.object({
  horas: z.coerce.number().min(0, 'Las horas no pueden ser negativas').max(500, 'Demasiadas horas para una semana'),
  notas: z.string().trim().optional().nullable().transform((v) => (v ? v : null)),
});
export type HorasSemanaInput = z.infer<typeof horasSemanaSchema>;

// Campos opcionales que llegan vacíos desde los formularios
const texto = z.string().trim().optional().nullable().transform((v) => (v ? v : null));
const fecha = z.string().optional().nullable().transform((v) => (v ? v : null));
const numero = z.coerce.number();

// ───────────── Clientes ─────────────

export const clienteSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre del cliente'),
  cif: texto,
  direccion: texto,
  cp: texto,
  ciudad: texto,
  provincia: texto,
  email: texto,
  telefono: texto,
  contacto: texto,
  web: texto,
  notas: texto,
  pago_tipo: z.enum(['empresa', 'dias', 'dia_mes']).default('empresa'),
  pago_valor: z.coerce.number().int().min(0).max(365).optional().nullable(),
}).refine((c) => c.pago_tipo === 'empresa' || (c.pago_valor != null && !Number.isNaN(c.pago_valor)), {
  message: 'Indica los días o el día del mes en que paga',
}).refine((c) => c.pago_tipo !== 'dia_mes' || (c.pago_valor! >= 1 && c.pago_valor! <= 31), {
  message: 'El día del mes tiene que estar entre 1 y 31',
});
export type ClienteInput = z.infer<typeof clienteSchema>;

export type CondicionPago = { pago_tipo?: 'empresa' | 'dias' | 'dia_mes' | null; pago_valor?: number | null };

/**
 * Fecha límite de pago de una factura según la condición del cliente.
 * «dia_mes» con 5: una factura del 31/10 vence el 05/11. Si el mes siguiente no
 * tiene ese día (p. ej. 31 en febrero), se usa su último día.
 */
export function calcularVencimiento(fecha: string, cliente: CondicionPago | null | undefined, diasEmpresa: number) {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  if (cliente?.pago_tipo === 'dia_mes' && cliente.pago_valor) {
    const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(a, m, Math.min(cliente.pago_valor, ultimo))).toISOString().slice(0, 10);
  }
  const dias = cliente?.pago_tipo === 'dias' && cliente.pago_valor != null ? cliente.pago_valor : diasEmpresa;
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Texto corto de la condición: «a 30 días», «día 5 del mes siguiente» */
export function textoCondicionPago(cliente: CondicionPago | null | undefined, diasEmpresa: number) {
  if (cliente?.pago_tipo === 'dia_mes' && cliente.pago_valor) return `día ${cliente.pago_valor} del mes siguiente`;
  const dias = cliente?.pago_tipo === 'dias' && cliente.pago_valor != null ? cliente.pago_valor : diasEmpresa;
  return dias === 0 ? 'al contado' : `a ${dias} días`;
}

// ───────────── Proyectos ─────────────

export const ESTADOS_PROYECTO = ['activo', 'pausado', 'terminado'] as const;
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];

export const TIPOS_PROYECTO = [
  { clave: 'web', nombre: 'Web corporativa' },
  { clave: 'ecommerce', nombre: 'Tienda online' },
  { clave: 'software', nombre: 'Software a medida' },
  { clave: 'app', nombre: 'App móvil' },
  { clave: 'automatizacion', nombre: 'Automatización' },
  { clave: 'integracion', nombre: 'Integraciones' },
  { clave: 'ia', nombre: 'Inteligencia artificial' },
  { clave: 'seo', nombre: 'SEO y rendimiento' },
  { clave: 'otro', nombre: 'Otro' },
] as const;
export type TipoProyecto = (typeof TIPOS_PROYECTO)[number]['clave'];
export const nombreTipoProyecto = (t: string) => TIPOS_PROYECTO.find((x) => x.clave === t)?.nombre ?? t;

/** hitos: importe cerrado repartido en entregas · horas: cada mes se factura lo trabajado */
export const MODALIDADES = ['hitos', 'horas'] as const;
export type Modalidad = (typeof MODALIDADES)[number];

export const proyectoSchema = z.object({
  cliente_id: z.string().uuid('Elige un cliente'),
  nombre: z.string().trim().min(1, 'Escribe el nombre del proyecto'),
  referencia: texto,
  tipo: z.enum(TIPOS_PROYECTO.map((t) => t.clave) as [TipoProyecto, ...TipoProyecto[]]).default('web'),
  descripcion: texto,
  url: texto,
  concepto: z.string().trim().min(1, 'Escribe qué se factura'),
  modalidad: z.enum(MODALIDADES).default('hitos'),
  estado: z.enum(ESTADOS_PROYECTO).default('activo'),
  fecha_inicio: fecha,
  fecha_fin: fecha,
  presupuesto: numero.min(0).default(0),
  horas_mes: numero.min(0).default(0),
  precio_hora: numero.min(0).default(0),
  iva_pct: numero.min(0).max(100).default(21),
  retencion_pct: numero.min(0).max(100).default(0),
  notas: texto,
});
export type ProyectoInput = z.infer<typeof proyectoSchema>;

export const hitoSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre del hito'),
  descripcion: texto,
  importe: numero.min(0, 'El importe no puede ser negativo'),
  fecha_prevista: fecha,
});
export type HitoInput = z.infer<typeof hitoSchema>;

/** Facturar un hito: como factura emitida o como prefactura para revisar */
export const facturarHitoSchema = z.object({
  fecha: z.string().min(1).optional(),
  borrador: z.boolean().optional(),
});

// ───────────── Facturas ─────────────

export const ESTADOS_FACTURA = ['borrador', 'emitida', 'cobrada', 'anulada'] as const;
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];

export const lineaSchema = z.object({
  concepto: z.string().trim().min(1, 'Falta el concepto'),
  cantidad: numero,
  unidad: z.string().trim().default('h'),
  precio: numero,
});
export type LineaInput = z.infer<typeof lineaSchema>;

export const facturaSchema = z.object({
  cliente_id: z.string().uuid('Elige un cliente'),
  proyecto_id: z.string().uuid().optional().nullable().transform((v) => v || null),
  periodo: fecha,
  fecha: z.string().min(1),
  vencimiento: fecha,
  iva_pct: numero.min(0).max(100),
  retencion_pct: numero.min(0).max(100).default(0),
  notas: texto,
  /** Prefactura: se guarda sin número hasta que se emite */
  borrador: z.boolean().optional(),
  lineas: z.array(lineaSchema).min(1, 'Añade al menos una línea'),
});
export type FacturaInput = z.infer<typeof facturaSchema>;

/**
 * Rectificar una factura emitida. Sin líneas correctas se anula entera;
 * con ellas, la rectificativa resta lo de la original y suma lo correcto.
 */
export const rectificarSchema = z.object({
  motivo: z.string().trim().min(3, 'Explica qué estaba mal'),
  fecha: z.string().min(1),
  lineas_correctas: z.array(lineaSchema).optional().nullable(),
});
export type RectificarInput = z.infer<typeof rectificarSchema>;

/** Facturación mensual: una factura por proyecto con las horas del mes */
export const facturarMesSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}/, 'Elige el mes'),
  fecha: z.string().min(1),
  proyectos: z
    .array(
      z.object({
        proyecto_id: z.string().uuid(),
        horas: numero.min(0),
        // Detalle de la línea de este mes; si no viene, se usa el del proyecto
        concepto: z.string().trim().min(1, 'Escribe el detalle de la factura').optional(),
      }),
    )
    .min(1, 'Elige al menos un proyecto'),
});
export type FacturarMesInput = z.infer<typeof facturarMesSchema>;

export interface Totales {
  base: number;
  iva_importe: number;
  retencion_importe: number;
  total: number;
}

export function calcularTotales(lineas: { cantidad: number; precio: number }[], iva_pct: number, retencion_pct: number): Totales {
  const base = redondear(lineas.reduce((s, l) => s + redondear(l.cantidad * l.precio), 0));
  const iva_importe = redondear((base * iva_pct) / 100);
  const retencion_importe = redondear((base * retencion_pct) / 100);
  return { base, iva_importe, retencion_importe, total: redondear(base + iva_importe - retencion_importe) };
}

// ───────────── Presupuestos ─────────────

export const ESTADOS_PRESUPUESTO = ['borrador', 'enviado', 'aceptado', 'rechazado'] as const;
export type EstadoPresupuesto = (typeof ESTADOS_PRESUPUESTO)[number];

export const presupuestoSchema = z.object({
  // Un cliente de la lista o, si aún no lo es, sus datos escritos a mano (una cosa por línea)
  cliente_id: z.string().uuid().optional().nullable().or(z.literal('')).transform((v) => v || null),
  cliente_texto: texto,
  titulo: z.string().trim().min(1, 'Ponle un título al presupuesto'),
  introduccion: texto,
  fecha: z.string().min(1),
  valido_hasta: fecha,
  iva_pct: numero.min(0).max(100),
  retencion_pct: numero.min(0).max(100).default(0),
  condiciones: texto,
  notas: texto,
  lineas: z.array(lineaSchema).min(1, 'Añade al menos una línea'),
}).refine((p) => p.cliente_id || p.cliente_texto, { message: 'Elige un cliente o escribe sus datos' });
export type PresupuestoInput = z.infer<typeof presupuestoSchema>;

/**
 * Cliente de un presupuesto escrito a mano → la misma forma que un cliente de la lista,
 * para que la ficha, el PDF y la firma lo muestren igual. La primera línea es el nombre.
 */
export function clienteDeTexto(texto?: string | null) {
  const lineas = (texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lineas.length) return null;
  return { id: null, nombre: lineas[0], lineas: lineas.slice(1), email: lineas.find((l) => /^\S+@\S+\.\S+$/.test(l)) ?? null, contacto: null };
}

/** Al aceptar un presupuesto se crea el proyecto y cada línea pasa a ser un hito */
export const aceptarPresupuestoSchema = z.object({
  crear_proyecto: z.boolean().default(true),
  nombre: z.string().trim().optional(),
  tipo: z.enum(TIPOS_PROYECTO.map((t) => t.clave) as [TipoProyecto, ...TipoProyecto[]]).default('web'),
  fecha_inicio: fecha,
});
export type AceptarPresupuestoInput = z.infer<typeof aceptarPresupuestoSchema>;

// ───────────── Catálogo de productos y servicios ─────────────

export const TIPOS_CATALOGO = [
  { clave: 'servicio', nombre: 'Servicio' },
  { clave: 'producto', nombre: 'Producto' },
] as const;

export const UNIDADES = [
  { clave: 'ud', nombre: 'unidades' },
  { clave: 'h', nombre: 'horas' },
  { clave: 'pa', nombre: 'partida' },
  { clave: 'mes', nombre: 'meses' },
  { clave: 'año', nombre: 'años' },
] as const;

export const catalogoSchema = z.object({
  tipo: z.enum(['servicio', 'producto']).default('servicio'),
  nombre: z.string().trim().min(1, 'Escribe el nombre'),
  descripcion: texto,
  categoria: texto,
  unidad: z.string().trim().min(1).default('ud'),
  precio: numero.min(0, 'El precio no puede ser negativo'),
  coste: z.coerce.number().min(0).optional().nullable(),
  activo: z.coerce.boolean().default(true),
});
export type CatalogoInput = z.infer<typeof catalogoSchema>;

/** Línea de presupuesto o factura a partir de un elemento del catálogo: el nombre y, debajo, la descripción */
export const lineaDeCatalogo = (c: { nombre: string; descripcion?: string | null; unidad: string; precio: number | string }, cantidad = 1) => ({
  concepto: c.descripcion ? `${c.nombre}\n${c.descripcion}` : c.nombre,
  cantidad,
  unidad: c.unidad,
  precio: Number(c.precio),
});

// ───────────── Contratos ─────────────

export const ESTADOS_CONTRATO = ['borrador', 'enviado', 'firmado', 'rechazado', 'anulado'] as const;
export type EstadoContrato = (typeof ESTADOS_CONTRATO)[number];

export const plantillaContratoSchema = z.object({
  nombre: z.string().trim().min(1, 'Ponle un nombre a la plantilla'),
  descripcion: texto,
  cuerpo: z.string().trim().min(20, 'Escribe el texto del contrato'),
  activa: z.coerce.boolean().default(true),
});
export type PlantillaContratoInput = z.infer<typeof plantillaContratoSchema>;

const idOpcional = z.string().uuid().optional().nullable().or(z.literal('')).transform((v) => v || null);

export const contratoSchema = z.object({
  cliente_id: z.string().uuid('Elige un cliente'),
  proyecto_id: idOpcional,
  presupuesto_id: idOpcional,
  plantilla_id: idOpcional,
  titulo: z.string().trim().min(1, 'Ponle un título al contrato'),
  cuerpo: z.string().trim().min(20, 'Escribe el texto del contrato'),
  fecha: z.string().min(1),
  notas: texto,
});
export type ContratoInput = z.infer<typeof contratoSchema>;

/** Variables que se pueden usar en las plantillas, con un ejemplo para la ayuda */
export const VARIABLES_CONTRATO = [
  ['empresa.nombre', 'Tu empresa'], ['empresa.cif', 'Tu CIF'], ['empresa.direccion_completa', 'Tu dirección'], ['empresa.ciudad', 'Tu ciudad'],
  ['empresa.dias_pago', 'Días para pagar'], ['cliente.nombre', 'Razón social del cliente'], ['cliente.cif', 'CIF del cliente'],
  ['cliente.direccion_completa', 'Dirección del cliente'], ['cliente.contacto', 'Persona de contacto'], ['proyecto.nombre', 'Proyecto'],
  ['proyecto.inicio', 'Fecha de inicio'], ['proyecto.entrega', 'Entrega prevista'], ['presupuesto.numero', 'Nº de presupuesto'],
  ['presupuesto.base', 'Importe sin IVA'], ['presupuesto.total', 'Importe con IVA'], ['servicios.lista', 'Servicios recurrentes del cliente'],
  ['fecha.larga', 'Fecha del contrato'], ['fecha.ciudad', 'Ciudad donde se firma'],
] as const;

const fechaLargaEs = (f?: string | null) =>
  f ? new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
const eurosEs = (n: unknown) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as Intl.NumberFormatOptions).format(Number(n ?? 0));
const direccion = (x: any) =>
  [x?.direccion, [x?.cp, x?.ciudad, x?.provincia && x.provincia !== x.ciudad && `(${x.provincia})`].filter(Boolean).join(' ')].filter(Boolean).join(', ');

/**
 * Pone los datos en las variables de una plantilla. Lo que falta se deja marcado
 * como «[falta …]» para que se vea antes de enviarlo.
 */
export function rellenarPlantilla(
  cuerpo: string,
  d: { empresa?: any; cliente?: any; proyecto?: any; presupuesto?: any; servicios?: any[]; fecha?: string },
) {
  const periodo: Record<string, string> = { mensual: 'al mes', trimestral: 'al trimestre', semestral: 'al semestre', anual: 'al año' };
  const valores: Record<string, string> = {
    'empresa.nombre': d.empresa?.nombre ?? '',
    'empresa.cif': d.empresa?.cif ?? '',
    'empresa.direccion_completa': direccion(d.empresa),
    'empresa.ciudad': d.empresa?.ciudad ?? '',
    'empresa.dias_pago': d.empresa?.dias_vencimiento != null ? String(d.empresa.dias_vencimiento) : '',
    'cliente.nombre': d.cliente?.nombre ?? '',
    'cliente.cif': d.cliente?.cif ?? '',
    'cliente.direccion_completa': direccion(d.cliente),
    'cliente.contacto': d.cliente?.contacto ?? '',
    'proyecto.nombre': d.proyecto?.nombre ?? d.presupuesto?.titulo ?? '',
    'proyecto.inicio': fechaLargaEs(d.proyecto?.fecha_inicio),
    'proyecto.entrega': fechaLargaEs(d.proyecto?.fecha_fin),
    'presupuesto.numero': d.presupuesto?.numero ?? '',
    'presupuesto.base': d.presupuesto ? eurosEs(d.presupuesto.base) : '',
    'presupuesto.total': d.presupuesto ? eurosEs(d.presupuesto.total) : '',
    'servicios.lista': (d.servicios ?? []).map((s) => `- ${s.nombre}${s.detalle ? ` (${s.detalle})` : ''}: ${eurosEs(s.precio)} ${periodo[s.periodicidad] ?? ''} + IVA`).join('\n'),
    'fecha.larga': fechaLargaEs(d.fecha),
    'fecha.ciudad': d.empresa?.ciudad ?? '',
  };
  return cuerpo.replace(/\{([a-z_]+\.[a-z_]+)\}/g, (todo, clave: string) => {
    if (!(clave in valores)) return todo;
    return valores[clave] || `[falta ${clave.replace('.', ' · ').replace('_', ' ')}]`;
  });
}

export type ParteTexto = { texto: string; negrita?: boolean };
export type BloqueContrato = { tipo: 'titulo' | 'apartado' | 'parrafo' | 'lista'; partes: ParteTexto[] };

/** «# Título», «## Apartado», párrafos y «- » listas, con **negrita**. Lo usan la web y el PDF. */
export function bloquesContrato(cuerpo: string): BloqueContrato[] {
  const partes = (t: string): ParteTexto[] =>
    t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((x) => (x.startsWith('**') && x.endsWith('**') ? { texto: x.slice(2, -2), negrita: true } : { texto: x }));
  const bloques: BloqueContrato[] = [];
  let parrafo: string[] = [];
  const cerrar = () => {
    if (parrafo.length) bloques.push({ tipo: 'parrafo', partes: partes(parrafo.join(' ')) });
    parrafo = [];
  };
  for (const linea of cuerpo.replace(/\r/g, '').split('\n')) {
    const l = linea.trim();
    if (!l) cerrar();
    else if (l.startsWith('## ')) { cerrar(); bloques.push({ tipo: 'apartado', partes: partes(l.slice(3)) }); }
    else if (l.startsWith('# ')) { cerrar(); bloques.push({ tipo: 'titulo', partes: partes(l.slice(2)) }); }
    else if (/^[-•] /.test(l)) { cerrar(); bloques.push({ tipo: 'lista', partes: partes(l.slice(2)) }); }
    else parrafo.push(l);
  }
  cerrar();
  return bloques;
}

// ───────────── Enviar como la empresa o como el usuario ─────────────

/** empresa: sale con el nombre de la empresa · usuario: con el nombre de quien lo envía y se le contesta a él */
export const ENVIAR_COMO = ['empresa', 'usuario'] as const;
export type EnviarComo = (typeof ENVIAR_COMO)[number];
export const enviarComoSchema = z.enum(ENVIAR_COMO).default('empresa');

export const nombreUsuarioSchema = z.object({ nombre: z.string().trim().min(2, 'Escribe tu nombre').max(80) });

/** Firma de un correo enviado por una persona: «Omar Somoza / Stella Group / Tel. …» */
export function firmaUsuario(nombre: string, empresa: { nombre?: string | null; telefono?: string | null } | null | undefined) {
  return [nombre, (empresa?.nombre ?? '').replace(/,?\s*(S\.?L\.?U?\.?|S\.?A\.?U?\.?)$/i, ''), empresa?.telefono ? `Tel. ${empresa.telefono}` : '']
    .filter(Boolean)
    .join('\n');
}

/**
 * Cambia la firma al final de un texto ya escrito (al pasar de enviar como la empresa
 * a enviar como el usuario o al revés). Si la persona ha tocado el final, no lo cambia.
 */
export function cambiarFirma(texto: string, de: string, a: string) {
  const sinEspacios = texto.replace(/\s+$/, '');
  return de && sinEspacios.endsWith(de) ? sinEspacios.slice(0, -de.length) + a : texto;
}

// ───────────── Firma electrónica ─────────────

export const enviarFirmaSchema = z.object({
  email: z.string().trim().toLowerCase().email('Escribe el correo de quien tiene que firmar'),
  nombre: texto,
  mensaje: texto,
  dias: z.coerce.number().int().min(1).max(90).default(30),
  como: enviarComoSchema,
});
export type EnviarFirmaInput = z.infer<typeof enviarFirmaSchema>;

export const firmarSchema = z.object({
  codigo: z.string().trim().regex(/^\d{6}$/, 'El código tiene 6 números'),
  nombre: z.string().trim().min(3, 'Escribe tu nombre y apellidos'),
  nif: z.string().trim().max(20).optional().nullable().transform((v) => (v ? v.toUpperCase() : null)),
  firma: z.string().startsWith('data:image/png;base64,', 'Firma en el recuadro').max(400_000, 'La firma es demasiado grande'),
  acepto: z.literal(true, { errorMap: () => ({ message: 'Marca que has leído el documento y lo aceptas' }) }),
});
export type FirmarInput = z.infer<typeof firmarSchema>;

export const rechazarFirmaSchema = z.object({ motivo: z.string().trim().min(3, 'Cuéntanos brevemente por qué').max(1000) });

// ───────────── Servicios recurrentes ─────────────

export const TIPOS_SERVICIO = [
  { clave: 'hosting', nombre: 'Hosting' },
  { clave: 'dominio', nombre: 'Dominio' },
  { clave: 'mantenimiento', nombre: 'Mantenimiento web' },
  { clave: 'soporte', nombre: 'Soporte técnico' },
  { clave: 'licencia', nombre: 'Licencia' },
  { clave: 'saas', nombre: 'Suscripción SaaS' },
  { clave: 'correo', nombre: 'Correo profesional' },
  { clave: 'otro', nombre: 'Otro' },
] as const;
export type TipoServicio = (typeof TIPOS_SERVICIO)[number]['clave'];
export const nombreTipoServicio = (t: string) => TIPOS_SERVICIO.find((x) => x.clave === t)?.nombre ?? t;

export const PERIODICIDADES = [
  { clave: 'mensual', nombre: 'Mensual', meses: 1 },
  { clave: 'trimestral', nombre: 'Trimestral', meses: 3 },
  { clave: 'semestral', nombre: 'Semestral', meses: 6 },
  { clave: 'anual', nombre: 'Anual', meses: 12 },
] as const;
export type Periodicidad = (typeof PERIODICIDADES)[number]['clave'];
export const mesesPeriodicidad = (p: string) => PERIODICIDADES.find((x) => x.clave === p)?.meses ?? 1;

/** Suma meses a una fecha; si el mes de destino no tiene ese día, usa el último (31/01 + 1 → 28/02) */
export function sumarMeses(fecha: string, meses: number) {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

/** Lo que supone un servicio cada mes (para la cuota recurrente mensual) */
export const importeMensual = (importe: number, periodicidad: string) => redondear(importe / mesesPeriodicidad(periodicidad));

export const servicioSchema = z.object({
  cliente_id: z.string().uuid('Elige un cliente'),
  proyecto_id: z.string().uuid().optional().nullable().or(z.literal('')).transform((v) => v || null),
  tipo: z.enum(TIPOS_SERVICIO.map((t) => t.clave) as [TipoServicio, ...TipoServicio[]]).default('hosting'),
  nombre: z.string().trim().min(1, 'Escribe qué servicio es'),
  detalle: texto,
  proveedor: texto,
  precio: numero.min(0),
  coste: numero.min(0).default(0),
  periodicidad: z.enum(PERIODICIDADES.map((p) => p.clave) as [Periodicidad, ...Periodicidad[]]).default('mensual'),
  iva_pct: numero.min(0).max(100).default(21),
  fecha_inicio: z.string().min(1, 'Pon la fecha de alta'),
  proxima_renovacion: z.string().min(1, 'Pon la fecha de la próxima renovación'),
  renovacion_auto: z.coerce.boolean().default(true),
  notas: texto,
});
export type ServicioInput = z.infer<typeof servicioSchema>;

/** Facturar las renovaciones que vencen hasta una fecha: una factura por cliente */
export const facturarRenovacionesSchema = z.object({
  hasta: z.string().min(1),
  fecha: z.string().min(1),
  servicios: z.array(z.string().uuid()).min(1, 'Elige al menos un servicio'),
  borrador: z.boolean().optional(),
});
export type FacturarRenovacionesInput = z.infer<typeof facturarRenovacionesSchema>;

// ───────────── Empleados ─────────────

export const empleadoSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre'),
  apellidos: texto,
  dni: texto,
  nss: texto,
  puesto: texto,
  telefono: texto,
  email: texto,
  iban: texto,
  fecha_alta: fecha,
  fecha_baja: fecha,
  activo: z.coerce.boolean().default(true),
  salario_bruto_anual: numero.min(0),
  pagas: z.coerce.number().refine((n) => n === 12 || n === 14).default(14),
  irpf_pct: numero.min(0).max(100),
  coste_hora: z.coerce.number().min(0).optional().nullable(),
  proyecto_id: z.string().uuid().optional().nullable().or(z.literal('')).transform((v) => v || null),
  notas: texto,
});
export type EmpleadoInput = z.infer<typeof empleadoSchema>;

export const PUESTOS = [
  'CEO',
  'Director/a comercial',
  'Comercial',
  'Director/a de operaciones',
  'Marketing',
  'Soporte técnico',
  'Recursos humanos',
  'Desarrollador/a full stack',
  'Desarrollador/a frontend',
  'Desarrollador/a backend',
  'Diseñador/a UX/UI',
  'Especialista en IA',
  'Especialista SEO',
  'Jefe/a de proyecto',
  'Administración',
];

// ───────────── Nóminas ─────────────

export const generarNominasSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}/, 'Elige el mes'),
});

export interface CalculoNomina {
  bruto: number;
  ss_trabajador: number;
  irpf: number;
  neto: number;
  ss_empresa: number;
  coste_empresa: number;
}

/**
 * Estimación sencilla de nómina. La nómina oficial la calcula la gestoría;
 * esto sirve para saber cuánto pagar y cuánto cuesta cada persona.
 * Con 14 pagas, junio y diciembre llevan paga extra. La cotización se hace
 * sobre el salario anual / 12 (pagas extra prorrateadas).
 */
export function calcularNomina(
  salario_bruto_anual: number,
  pagas: number,
  irpf_pct: number,
  periodo: string,
  ss_trabajador_pct: number,
  ss_empresa_pct: number,
): CalculoNomina {
  const mes = Number(periodo.slice(5, 7));
  const mensual = salario_bruto_anual / pagas;
  const extra = pagas === 14 && (mes === 6 || mes === 12);
  const bruto = redondear(extra ? mensual * 2 : mensual);
  const baseCotizacion = salario_bruto_anual / 12;
  const ss_trabajador = redondear((baseCotizacion * ss_trabajador_pct) / 100);
  const irpf = redondear((bruto * irpf_pct) / 100);
  const ss_empresa = redondear((baseCotizacion * ss_empresa_pct) / 100);
  return {
    bruto,
    ss_trabajador,
    irpf,
    neto: redondear(bruto - ss_trabajador - irpf),
    ss_empresa,
    coste_empresa: redondear(bruto + ss_empresa),
  };
}

// ───────────── Empresa ─────────────

export const empresaSchema = z.object({
  nombre: z.string().trim().min(1),
  cif: texto,
  direccion: texto,
  cp: texto,
  ciudad: texto,
  provincia: texto,
  email: texto,
  telefono: texto,
  iban: texto,
  serie_factura: z.string().trim().max(5).default(''),
  numeracion: z.enum(['anual', 'continua']).default('anual'),
  proximo_numero: z.coerce.number().int().min(1).optional(),
  forma_pago: z.string().trim().min(1).default('Transferencia bancaria'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1f6feb'),
  logo: z
    .string()
    .max(1_500_000, 'El logo es demasiado grande')
    .optional()
    .nullable()
    .transform((v) => v || null),
  dias_vencimiento: z.coerce.number().int().min(0),
  iva_pct: numero.min(0).max(100),
  ss_trabajador_pct: numero.min(0).max(100),
  ss_empresa_pct: numero.min(0).max(100),
  pie_factura: texto,
  validez_presupuesto_dias: z.coerce.number().int().min(1).max(365).default(30),
  condiciones_presupuesto: texto,
  accion_principal: z.enum(['presupuesto', 'facturar_mes']).default('presupuesto'),
});
export type EmpresaInput = z.infer<typeof empresaSchema>;

/** Cómo quedará el número de factura: F2026-0001 o 29 */
export function ejemploNumero(serie: string, numeracion: 'anual' | 'continua', n: number, anio = new Date().getFullYear()) {
  return numeracion === 'continua' ? `${serie}${n}` : `${serie}${anio}-${String(n).padStart(4, '0')}`;
}

// ───────────── Usuarios, roles y permisos ─────────────

/** Módulos de la app a los que se puede dar permiso */
export const PERMISOS = [
  { clave: 'inicio', nombre: 'Inicio', descripcion: 'Resumen con lo pendiente y cifras del año' },
  { clave: 'facturas', nombre: 'Facturas', descripcion: 'Ver, crear y emitir facturas y prefacturas' },
  { clave: 'clientes', nombre: 'Clientes', descripcion: 'Datos y condiciones de pago de los clientes' },
  { clave: 'proyectos', nombre: 'Proyectos', descripcion: 'Proyectos, hitos, horas y prefacturas' },
  { clave: 'presupuestos', nombre: 'Presupuestos', descripcion: 'Preparar, enviar a firmar y aceptar presupuestos' },
  { clave: 'contratos', nombre: 'Contratos', descripcion: 'Contratos, sus plantillas y la firma electrónica' },
  { clave: 'servicios', nombre: 'Servicios', descripcion: 'Hosting, dominios, mantenimientos y sus renovaciones' },
  { clave: 'empleados', nombre: 'Equipo', descripcion: 'Fichas y sueldos del equipo' },
  { clave: 'nominas', nombre: 'Nóminas', descripcion: 'Preparar y marcar nóminas como pagadas' },
  { clave: 'cobros', nombre: 'Cobros', descripcion: 'Seguimiento de cobros y recordatorios' },
  { clave: 'gestoria', nombre: 'Gestoría', descripcion: 'Informes para la gestoría' },
  { clave: 'empresa', nombre: 'Mi empresa', descripcion: 'Datos fiscales, logo y numeración' },
] as const;
export type Permiso = (typeof PERMISOS)[number]['clave'];
export const TODOS_LOS_PERMISOS = PERMISOS.map((p) => p.clave) as Permiso[];

export type TipoRol = 'admin' | 'oficina' | 'trabajador';

/** Permiso que exige cada prefijo de la API (/api/<prefijo>/...). Lo que no está aquí es solo para administradores. */
const PERMISO_DE_PREFIJO: Record<string, Permiso | 'usuarios'> = {
  inicio: 'inicio',
  facturas: 'facturas',
  clientes: 'clientes',
  proyectos: 'proyectos',
  hitos: 'proyectos',
  presupuestos: 'presupuestos',
  catalogo: 'presupuestos',
  contratos: 'contratos',
  'plantillas-contrato': 'contratos',
  servicios: 'servicios',
  empleados: 'empleados',
  nominas: 'nominas',
  cobros: 'cobros',
  telegram: 'cobros',
  gestoria: 'gestoria',
  empresa: 'empresa',
  usuarios: 'usuarios',
  roles: 'usuarios',
};

/**
 * Consultas que también necesitan otros módulos para funcionar (p. ej. al hacer
 * una factura hay que elegir cliente y proyecto). Solo lectura (GET).
 */
const LECTURA_TAMBIEN: Partial<Record<Permiso, Permiso[]>> = {
  clientes: ['facturas', 'proyectos', 'presupuestos', 'servicios', 'cobros', 'contratos'],
  proyectos: ['facturas', 'clientes', 'empleados', 'presupuestos', 'servicios', 'contratos'],
  empleados: ['proyectos'],
  presupuestos: ['clientes', 'proyectos', 'contratos'],
  servicios: ['inicio', 'clientes', 'contratos'],
  facturas: ['cobros'],
};

/**
 * ¿Puede un usuario con estos permisos hacer esta petición? `ruta` sin /api,
 * p. ej. '/facturas/123'. GET /empresa lo puede ver cualquiera de la oficina
 * (sale en las facturas y en las nóminas).
 */
export function puedeAcceder(metodo: string, ruta: string, permisos: readonly string[]) {
  const prefijo = ruta.replace(/^\/+/, '').split(/[/?]/)[0];
  const necesario = PERMISO_DE_PREFIJO[prefijo];
  if (!necesario) return false;
  if (permisos.includes(necesario)) return true;
  if (metodo === 'GET') {
    if (necesario === 'empresa') return true;
    const tambien = LECTURA_TAMBIEN[necesario as Permiso] ?? [];
    return tambien.some((p) => permisos.includes(p));
  }
  return false;
}

export const rolSchema = z.object({
  nombre: z.string().trim().min(1, 'Ponle un nombre al rol').max(40),
  permisos: z.array(z.enum(TODOS_LOS_PERMISOS as [Permiso, ...Permiso[]])),
});
export type RolInput = z.infer<typeof rolSchema>;

export const usuarioCrearSchema = z.object({
  email: z.string().trim().toLowerCase().email('Escribe un email válido'),
  password: z.string().min(8, 'La contraseña tiene que tener al menos 8 caracteres'),
  rol_id: z.string().uuid('Elige un rol'),
  empleado_id: z.string().uuid().nullable().optional().transform((v) => v || null),
  permisos: z.array(z.enum(TODOS_LOS_PERMISOS as [Permiso, ...Permiso[]])).nullable().optional().transform((v) => v ?? null),
});
export type UsuarioCrearInput = z.infer<typeof usuarioCrearSchema>;

export const usuarioEditarSchema = usuarioCrearSchema.omit({ email: true, password: true });
export type UsuarioEditarInput = z.infer<typeof usuarioEditarSchema>;

export const contrasenaSchema = z.object({ password: z.string().min(8, 'La contraseña tiene que tener al menos 8 caracteres') });

// ───────── Correo de factura: el mismo texto desde la app y desde Telegram ─────────

const eurosCorreo = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as Intl.NumberFormatOptions).format(n);
const fechaCorreo = (f: string) =>
  new Date(`${f.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** «Stella Group Soluciones Digitales, S.L.» → «El equipo de Stella Group / Soluciones Digitales / Tel. …» */
export function firmaCorreo(empresa: { nombre?: string | null; telefono?: string | null } | null | undefined) {
  const palabras = (empresa?.nombre ?? '').replace(/,?\s*(S\.?L\.?U?\.?|S\.?A\.?U?\.?)$/i, '').split(' ');
  // Las dos primeras palabras suelen ser la marca y el resto la actividad, como en el logo
  const nombre = palabras.length > 3 ? `${palabras.slice(0, 2).join(' ')}\n${palabras.slice(2).join(' ')}` : palabras.join(' ');
  return [`El equipo de ${nombre}`, empresa?.telefono ? `Tel. ${empresa.telefono}` : ''].filter(Boolean).join('\n');
}

/** Texto del correo con el que se manda una factura o prefactura (f como lo devuelve GET /facturas/:id) */
export function mensajeFactura(f: any) {
  const saludo = `Hola${f.cliente?.contacto ? `, ${f.cliente.contacto}:` : ','}`;
  const mes = f.periodo ? ` de ${nombreMes(f.periodo).replace(' ', ' de ')}` : '';
  const proyecto = f.proyecto ? ` del proyecto ${f.proyecto.nombre}` : '';
  const intro = f.numero
    ? f.rectificada
      ? `Te adjuntamos la factura rectificativa ${f.numero}, que corrige la factura ${f.rectificada.numero}${f.motivo_rectificacion ? ` (${f.motivo_rectificacion.toLowerCase()})` : ''}.`
      : `Te adjuntamos la factura ${f.numero}, correspondiente a los servicios${mes}${proyecto}.`
    : `Te adjuntamos la prefactura${mes}${proyecto} para que le eches un vistazo antes de emitirla. Si está todo bien, dínoslo y la emitimos.`;
  const ayuda = f.numero
    ? 'Si necesitas alguna aclaración o documentación adicional para tramitarla, escríbenos por aquí y lo revisamos.'
    : 'Si hay que ajustar algo o necesitas alguna documentación adicional, escríbenos por aquí y lo revisamos.';
  return [saludo, intro, ayuda, `Gracias y un saludo,\n\n${firmaCorreo(f.empresa)}`].join('\n\n');
}

export function asuntoFactura(f: any) {
  const doc = f.rectifica_id ? `Factura rectificativa ${f.numero}` : f.numero ? `Factura ${f.numero}` : 'Prefactura';
  const extra = f.numero && f.vencimiento ? `vence el ${fechaCorreo(f.vencimiento)}` : f.proyecto?.nombre;
  return [doc, eurosCorreo(Number(f.total)), extra].filter(Boolean).join(' · ');
}
