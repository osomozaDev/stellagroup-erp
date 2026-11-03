import { BadRequestException, ForbiddenException, GoneException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { clienteDeTexto, EnviarFirmaInput, firmaCorreo, FirmarInput, firmaUsuario } from '@stella/shared';
import { nombreArchivoPdf } from '@stella/pdf';
import { SUPABASE } from '../comun/supabase.module';
import { clienteDePresupuesto } from '../comun/alta-cliente';
import { ok } from '../comun/db';
import { CorreoService } from '../comun/correo.service';
import { Remitente } from '../comun/remitente';
import { html, TelegramService } from '../comun/telegram.service';
import { EnvioFacturaService } from './envio-factura.service';

export type TipoDocumento = 'presupuesto' | 'contrato';

const MAX_INTENTOS = 5;
const MAX_CODIGOS = 5;
const MINUTOS_CODIGO = 10;

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');
/** JSON con las claves ordenadas: la misma copia da siempre la misma huella */
const canonico = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico((v as any)[k])}`).join(',')}}`
      : JSON.stringify(v ?? null);
/** «laura@empresa.es» → «la***@empresa.es» */
const ocultarEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2');
const nombreDoc = (tipo: TipoDocumento, d: any) => (tipo === 'contrato' ? `contrato ${d.numero}` : `presupuesto ${d.numero}`);

/**
 * Firma electrónica de presupuestos y contratos. El documento se congela al enviarlo
 * (copia + huella SHA-256), el firmante confirma con un código de un solo uso que le
 * llega al correo y firma a mano. Las evidencias quedan en la tabla «firmas» y en el PDF.
 */
@Injectable()
export class FirmasService {
  private readonly log = new Logger('Firmas');
  private readonly web: string;
  private readonly secreto: string;

  constructor(
    @Inject(SUPABASE) private readonly db: SupabaseClient,
    private readonly correo: CorreoService,
    private readonly telegram: TelegramService,
    private readonly envio: EnvioFacturaService,
    config: ConfigService,
  ) {
    this.web = (config.get<string>('WEB_URL')?.split(',')[0] ?? 'http://localhost:5183').replace(/\/$/, '');
    this.secreto = createHash('sha256').update(`firmas:${config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`).digest('hex');
  }

  private hashCodigo(firmaId: string, codigo: string) {
    return createHmac('sha256', this.secreto).update(`${firmaId}:${codigo}`).digest('hex');
  }

  /** El documento completo, tal como sale en el PDF */
  async documento(tipo: TipoDocumento, id: string): Promise<any> {
    const empresa = ok(await this.db.from('empresa').select('nombre, cif, direccion, cp, ciudad, provincia, email, telefono, color, logo, forma_pago, iban, pie_factura, condiciones_presupuesto').eq('id', 1).single());
    if (tipo === 'presupuesto') {
      const p = ok(
        await this.db
          .from('presupuestos')
          .select('*, cliente:clientes(nombre, cif, direccion, cp, ciudad, provincia, email, contacto), lineas:presupuesto_lineas(concepto, cantidad, unidad, precio, importe, orden)')
          .eq('id', id)
          .order('orden', { referencedTable: 'presupuesto_lineas' })
          .single(),
      ) as any;
      return { ...p, cliente: p.cliente ?? clienteDeTexto(p.cliente_texto), empresa, tipo_documento: 'presupuesto' };
    }
    const c = ok(
      await this.db
        .from('contratos')
        .select('*, cliente:clientes(nombre, cif, direccion, cp, ciudad, provincia, email, contacto), proyecto:proyectos(id, nombre), presupuesto:presupuestos(id, numero, titulo, total)')
        .eq('id', id)
        .single(),
    ) as any;
    return { ...c, empresa, tipo_documento: 'contrato' };
  }

  /** Lo que se guarda al enviar: sin campos que cambian solos (estado, fechas internas, notas) */
  private copia(tipo: TipoDocumento, d: any) {
    const { estado: _e, respondido_en: _r, firmado_en: _f, created_at: _c, updated_at: _u, notas, proyecto_id: _p, ...resto } = d;
    return tipo === 'presupuesto' ? { ...resto, notas } : resto;
  }

  private tabla(tipo: TipoDocumento) {
    return tipo === 'presupuesto' ? 'presupuestos' : 'contratos';
  }

  /** Firmas de un documento para la app (sin enlaces, códigos ni copia) */
  async deDocumento(tipo: TipoDocumento, id: string) {
    return ok(
      await this.db
        .from('firmas')
        .select('id, estado, email, nombre, mensaje, enviado_por, enviado_en, caduca, visto_en, verificado_en, firmado_en, rechazado_en, motivo_rechazo, firmante_nombre, firmante_nif, ip, navegador, huella')
        .eq('documento_tipo', tipo)
        .eq('documento_id', id)
        .order('created_at', { ascending: false }),
    ) as any[];
  }

  /** ¿Se puede cambiar el documento? No si está esperando firma o ya firmado */
  async comprobarEditable(tipo: TipoDocumento, id: string) {
    const firmas = await this.deDocumento(tipo, id);
    if (firmas.some((f) => f.estado === 'firmado')) throw new BadRequestException('Este documento ya está firmado y no se puede cambiar. Duplícalo si necesitas otra versión.');
    if (firmas.some((f) => f.estado === 'pendiente')) throw new BadRequestException('Está pendiente de firma. Anula la petición de firma para poder cambiarlo.');
  }

  /** remitente: si lo envía una persona en su nombre (sale con su nombre y le contestan a ella); null = la empresa */
  async enviar(tipo: TipoDocumento, id: string, input: EnviarFirmaInput, quien: string | null, remitente: Remitente | null = null) {
    const d = await this.documento(tipo, id);
    const editable = tipo === 'presupuesto' ? ['borrador', 'enviado'] : ['borrador', 'enviado', 'rechazado'];
    if (!editable.includes(d.estado)) throw new BadRequestException(`No se puede enviar a firmar un ${tipo} ${d.estado}`);
    if (tipo === 'contrato' && /\[falta [^\]]+\]/.test(d.cuerpo)) throw new BadRequestException('Al contrato le faltan datos (marcados como «[falta …]»). Complétalos antes de enviarlo.');
    if ((await this.deDocumento(tipo, id)).some((f) => f.estado === 'firmado')) throw new BadRequestException('Este documento ya está firmado');

    // Solo una petición viva por documento: la anterior deja de valer
    ok(await this.db.from('firmas').update({ estado: 'anulado' }).eq('documento_tipo', tipo).eq('documento_id', id).eq('estado', 'pendiente'));

    const copia = this.copia(tipo, d);
    const enlace = randomBytes(24).toString('base64url');
    const firma = ok(
      await this.db
        .from('firmas')
        .insert({
          documento_tipo: tipo,
          documento_id: id,
          documento: copia,
          huella: sha256(canonico(copia)),
          email: input.email,
          nombre: input.nombre,
          mensaje: input.mensaje,
          enlace_hash: sha256(enlace),
          caduca: new Date(Date.now() + input.dias * 864e5).toISOString(),
          enviado_por: quien,
        })
        .select('id, caduca')
        .single(),
    ) as any;
    ok(await this.db.from(this.tabla(tipo)).update({ estado: 'enviado', ...(tipo === 'presupuesto' ? { respondido_en: null } : {}) }).eq('id', id));

    // En el «#»: el enlace no llega a ningún servidor ni queda en registros
    const url = `${this.web}/firmar#t=${enlace}`;
    const saludo = input.nombre ? `Hola, ${input.nombre.split(' ')[0]}:` : 'Hola:';
    const que = tipo === 'contrato' ? `el contrato «${d.titulo}» (${d.numero})` : `el presupuesto «${d.titulo}» (${d.numero})`;
    let modo: 'real' | 'prueba' = 'prueba';
    try {
      ({ modo } = await this.correo.enviarSimple({
        para: input.email,
        asunto: `${remitente?.nombre ?? d.empresa.nombre} te envía ${tipo === 'contrato' ? 'un contrato' : 'un presupuesto'} para firmar`,
        parrafos: [
          saludo,
          ...(input.mensaje ? [input.mensaje] : []),
          `Te ${remitente ? 'envío' : 'enviamos'} ${que} para que lo revises y, si estás de acuerdo, lo firmes desde el móvil o el ordenador. Solo te llevará un minuto.`,
          `Un saludo,\n${remitente ? firmaUsuario(remitente.nombre, d.empresa) : firmaCorreo(d.empresa)}`,
        ],
        remitente,
        boton: { texto: 'Revisar y firmar', url },
        nota: `El enlace es personal y vale hasta el ${new Date(firma.caduca).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}. Para firmar te enviaremos un código a este correo.`,
      }));
    } catch (e: any) {
      // El enlace sigue sirviendo: se puede copiar desde la app y mandarlo por otro medio
      this.log.error(`No se ha podido mandar la petición de firma: ${e.message}`);
      return { id: firma.id, enlace: url, modo: 'error' as const, error: e.message };
    }
    return { id: firma.id, enlace: url, modo };
  }

  async anular(tipo: TipoDocumento, id: string) {
    const r = ok(await this.db.from('firmas').update({ estado: 'anulado' }).eq('documento_tipo', tipo).eq('documento_id', id).eq('estado', 'pendiente').select('id')) as any[];
    if (!r.length) throw new BadRequestException('No hay ninguna firma pendiente');
    return { ok: true };
  }

  // ───────────── Lado del firmante (rutas públicas) ─────────────

  private async porEnlace(enlace: string) {
    if (!enlace || enlace.length < 20) throw new NotFoundException('Este enlace no es válido');
    const f = ok(await this.db.from('firmas').select('*').eq('enlace_hash', sha256(enlace)).maybeSingle()) as any;
    if (!f) throw new NotFoundException('Este enlace no es válido');
    return f;
  }

  private abierta(f: any) {
    if (f.estado === 'anulado') throw new GoneException('Esta petición de firma se ha anulado. Si te han enviado otra, usa el enlace más reciente.');
    if (f.estado !== 'pendiente') throw new BadRequestException(f.estado === 'firmado' ? 'Este documento ya está firmado' : 'Este documento se ha rechazado');
    if (new Date(f.caduca) < new Date()) throw new GoneException('El enlace ha caducado. Pide que te lo vuelvan a enviar.');
  }

  /** Lo que ve el firmante: el documento congelado y en qué punto está */
  async ver(enlace: string) {
    const f = await this.porEnlace(enlace);
    if (f.estado === 'anulado') throw new GoneException('Esta petición de firma se ha anulado. Si te han enviado otra, usa el enlace más reciente.');
    if (!f.visto_en && f.estado === 'pendiente') ok(await this.db.from('firmas').update({ visto_en: new Date().toISOString() }).eq('id', f.id));
    return {
      tipo: f.documento_tipo as TipoDocumento,
      documento: f.documento,
      estado: f.estado,
      caducada: f.estado === 'pendiente' && new Date(f.caduca) < new Date(),
      caduca: f.caduca,
      email: ocultarEmail(f.email),
      nombre: f.nombre,
      mensaje: f.mensaje,
      huella: f.huella,
      firmante_nombre: f.firmante_nombre,
      firmado_en: f.firmado_en,
      rechazado_en: f.rechazado_en,
    };
  }

  async pedirCodigo(enlace: string) {
    const f = await this.porEnlace(enlace);
    this.abierta(f);
    if (f.codigos_enviados >= MAX_CODIGOS) throw new ForbiddenException('Has pedido demasiados códigos. Pide que te vuelvan a enviar el documento.');
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    ok(
      await this.db
        .from('firmas')
        .update({
          codigo_hash: this.hashCodigo(f.id, codigo),
          codigo_caduca: new Date(Date.now() + MINUTOS_CODIGO * 60e3).toISOString(),
          codigo_intentos: 0,
          codigos_enviados: f.codigos_enviados + 1,
        })
        .eq('id', f.id),
    );
    const empresa = ok(await this.db.from('empresa').select('nombre').eq('id', 1).single()) as any;
    await this.correo.enviarSimple({
      para: f.email,
      asunto: `${codigo} es tu código para firmar con ${empresa.nombre}`,
      parrafos: [`Este es tu código para firmar el ${nombreDoc(f.documento_tipo, f.documento)}:`],
      destacado: codigo,
      nota: `Caduca en ${MINUTOS_CODIGO} minutos. Si no estás firmando nada, ignora este correo.`,
    });
    return { email: ocultarEmail(f.email), minutos: MINUTOS_CODIGO };
  }

  async firmar(enlace: string, input: FirmarInput, ip: string | null, navegador: string | null) {
    const f = await this.porEnlace(enlace);
    this.abierta(f);
    if (!f.codigo_hash || !f.codigo_caduca) throw new BadRequestException('Primero pide el código');
    if (new Date(f.codigo_caduca) < new Date()) throw new BadRequestException('El código ha caducado. Pide uno nuevo.');
    if (f.codigo_intentos >= MAX_INTENTOS) throw new ForbiddenException('Demasiados intentos. Pide un código nuevo.');
    const esperado = Buffer.from(f.codigo_hash);
    const recibido = Buffer.from(this.hashCodigo(f.id, input.codigo));
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) {
      ok(await this.db.from('firmas').update({ codigo_intentos: f.codigo_intentos + 1 }).eq('id', f.id));
      const quedan = MAX_INTENTOS - f.codigo_intentos - 1;
      throw new BadRequestException(quedan > 0 ? `El código no es correcto. Te quedan ${quedan} intentos.` : 'El código no es correcto. Pide uno nuevo.');
    }
    // La copia no puede haber cambiado desde que se envió
    if (sha256(canonico(f.documento)) !== f.huella) throw new BadRequestException('El documento no coincide con el que se envió. Pide que te lo vuelvan a enviar.');

    const ahora = new Date().toISOString();
    const firmada = ok(
      await this.db
        .from('firmas')
        .update({
          estado: 'firmado',
          verificado_en: ahora,
          firmado_en: ahora,
          firmante_nombre: input.nombre,
          firmante_nif: input.nif,
          firma_imagen: input.firma,
          ip,
          navegador: navegador?.slice(0, 400) ?? null,
          codigo_hash: null,
        })
        .eq('id', f.id)
        .eq('estado', 'pendiente')
        .select('*')
        .maybeSingle(),
    ) as any;
    if (!firmada) throw new BadRequestException('Este documento ya no está pendiente de firma');

    const hoy = ahora.slice(0, 10);
    if (f.documento_tipo === 'presupuesto') {
      ok(await this.db.from('presupuestos').update({ estado: 'aceptado', respondido_en: hoy }).eq('id', f.documento_id));
      // Quien firma un presupuesto pasa a ser cliente: si estaba escrito a mano, se da de alta
      await clienteDePresupuesto(this.db, f.documento_id).catch((e) => this.log.error(`Firma ${f.id}: no se ha podido dar de alta el cliente: ${e.message}`));
    } else {
      ok(await this.db.from('contratos').update({ estado: 'firmado', firmado_en: ahora }).eq('id', f.documento_id));
    }

    const d = f.documento;
    const ruta = `/${f.documento_tipo === 'contrato' ? 'contratos' : 'presupuestos'}/${f.documento_id}`;
    await this.telegram
      .avisar('firmas', `✍️ <b>Firmado</b> · ${html(input.nombre)}\n<a href="${this.telegram.web}${ruta}">${html(nombreDoc(f.documento_tipo, d))} · ${html(d.cliente?.nombre ?? '')}</a>\n${html(d.titulo)}`, {
        botones: [[this.telegram.abrir('Abrir', ruta)]],
      })
      .catch(() => null);

    // Copia firmada para el firmante y para la empresa
    try {
      const { pdf, nombre } = await this.pdf(firmada);
      await this.correo.enviarSimple({
        para: f.email,
        asunto: `Copia firmada: ${d.titulo}`,
        parrafos: [`Hola, ${input.nombre.split(' ')[0]}:`, `Gracias por firmar el ${nombreDoc(f.documento_tipo, d)}. Te adjuntamos la copia firmada, con el certificado de la firma en la última página.`],
        adjunto: { nombre, contenido: pdf },
      });
      if (d.empresa?.email) {
        await this.correo.enviarSimple({
          para: d.empresa.email,
          asunto: `✍️ ${d.cliente?.nombre ?? 'El cliente'} ha firmado el ${nombreDoc(f.documento_tipo, d)}`,
          parrafos: [`${input.nombre} (${f.email}) ha firmado «${d.titulo}».`],
          boton: { texto: 'Ver en Stella ERP', url: `${this.web}${ruta}` },
          adjunto: { nombre, contenido: pdf },
        });
      }
    } catch (e: any) {
      this.log.error(`Firma ${f.id} guardada, pero no se ha podido mandar la copia: ${e.message}`);
    }
    return { ok: true, firmado_en: ahora };
  }

  async rechazar(enlace: string, motivo: string) {
    const f = await this.porEnlace(enlace);
    this.abierta(f);
    const ahora = new Date().toISOString();
    ok(await this.db.from('firmas').update({ estado: 'rechazado', rechazado_en: ahora, motivo_rechazo: motivo }).eq('id', f.id));
    if (f.documento_tipo === 'presupuesto') ok(await this.db.from('presupuestos').update({ estado: 'rechazado', respondido_en: ahora.slice(0, 10) }).eq('id', f.documento_id));
    else ok(await this.db.from('contratos').update({ estado: 'rechazado' }).eq('id', f.documento_id));
    const d = f.documento;
    const ruta = `/${f.documento_tipo === 'contrato' ? 'contratos' : 'presupuestos'}/${f.documento_id}`;
    await this.telegram
      .avisar('firmas', `🙅 <b>Rechazado</b> · ${html(f.email)}\n<a href="${this.telegram.web}${ruta}">${html(nombreDoc(f.documento_tipo, d))} · ${html(d.cliente?.nombre ?? '')}</a>\nMotivo: ${html(motivo)}`, {
        botones: [[this.telegram.abrir('Abrir', ruta)]],
      })
      .catch(() => null);
    return { ok: true };
  }

  /** PDF de la copia congelada con la firma y la página de evidencias */
  async pdf(f: any) {
    const doc = {
      ...f.documento,
      firma: f.estado === 'firmado'
        ? {
          id: f.id, email: f.email, nombre: f.firmante_nombre, nif: f.firmante_nif, imagen: f.firma_imagen, huella: f.huella, ip: f.ip, navegador: f.navegador,
          enviado_por: f.enviado_por, enviado_en: f.enviado_en, visto_en: f.visto_en, verificado_en: f.verificado_en, firmado_en: f.firmado_en,
        }
        : null,
    };
    const r = await this.envio.pdfDe(doc);
    return { pdf: r.pdf, nombre: f.estado === 'firmado' ? nombreArchivoPdf(doc).replace(/\.pdf$/, ' (firmado).pdf') : r.nombre };
  }

  async pdfPorEnlace(enlace: string) {
    const f = await this.porEnlace(enlace);
    if (f.estado === 'anulado') throw new GoneException('Esta petición de firma se ha anulado');
    return this.pdf(f);
  }

  /** PDF firmado más reciente de un documento (para la app); null si no está firmado */
  async pdfFirmado(tipo: TipoDocumento, id: string) {
    const f = ok(await this.db.from('firmas').select('*').eq('documento_tipo', tipo).eq('documento_id', id).eq('estado', 'firmado').order('firmado_en', { ascending: false }).limit(1).maybeSingle());
    return f ? this.pdf(f) : null;
  }
}
