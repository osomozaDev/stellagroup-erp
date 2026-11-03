import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import nodemailer, { Transporter } from 'nodemailer';
import { SUPABASE } from './supabase.module';
import { ok } from './db';
import { correoAcceso, correoHtml, correoSimple, correoTexto, DatosCorreo, documento, logoIncrustado, nombreSinForma } from './plantilla-correo';
import { correosPortal, crearEnlacePortal, normalizarEmail } from './portal';

export interface Correo {
  factura_id: string;
  tipo: 'factura' | 'recordatorio';
  para: string;
  asunto: string;
  texto: string;
  adjunto?: { nombre: string; base64: string };
  automatico?: boolean;
}

/**
 * Envía correos por SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).
 * Sin SMTP configurado funciona en modo prueba: no sale nada, pero queda apuntado.
 */
@Injectable()
export class CorreoService {
  private readonly log = new Logger('Correo');
  private readonly transporte?: Transporter;
  private readonly remitente?: string;
  private readonly web?: string;

  constructor(
    config: ConfigService,
    @Inject(SUPABASE) private readonly db: SupabaseClient,
  ) {
    this.web = config.get<string>('WEB_URL')?.split(',')[0] ?? 'http://localhost:5183';
    const host = config.get<string>('SMTP_HOST');
    if (host) {
      const port = Number(config.get('SMTP_PORT') ?? 587);
      this.transporte = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: config.get('SMTP_USER') ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') } : undefined,
      });
      this.remitente = config.get('SMTP_FROM') ?? config.get('SMTP_USER');
    }
  }

  /** Avisa a la oficina de que un correo a un cliente ha rebotado o ha acabado en spam */
  async avisarProblema(e: { factura_id: string; para: string; asunto: string; estado: 'rebotado' | 'spam'; motivo: string | null }) {
    if (!this.transporte) return;
    const [empresa, factura] = await Promise.all([
      this.db.from('empresa').select('nombre, email').eq('id', 1).single().then((r) => ok(r) as any),
      this.db.from('facturas').select('numero, cliente:clientes(nombre)').eq('id', e.factura_id).single().then((r) => ok(r) as any),
    ]);
    const destino = empresa.email ?? this.remitente;
    if (!destino) return;
    const doc = factura.numero ? `la factura ${factura.numero}` : 'la prefactura';
    const enlace = `${(this.web ?? '').replace(/\/$/, '')}/facturas/${e.factura_id}`;
    const que = e.estado === 'spam' ? 'lo ha marcado como spam' : 'no le ha llegado';
    await this.transporte.sendMail({
      from: { name: 'Stella ERP', address: this.remitente ?? destino },
      to: destino,
      subject: `⚠️ El correo de ${doc} a ${factura.cliente?.nombre ?? e.para} ${que}`,
      text: [
        `El correo «${e.asunto}» enviado a ${e.para} ${que}.`,
        e.motivo ? `Motivo: ${e.motivo}.` : '',
        `Revisa el email del cliente y vuelve a enviarlo desde Stella ERP:\n${enlace}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    });
  }

  /** Enlace de entrada al portal de clientes (no va ligado a ninguna factura) */
  async enviarAcceso(para: string, cliente: string, url: string) {
    const empresa = ok(await this.db.from('empresa').select('nombre, email, cif, direccion, cp, ciudad, provincia, telefono, color, logo').eq('id', 1).single()) as any;
    if (!this.transporte) {
      this.log.warn(`Modo prueba (sin SMTP): enlace del portal para ${para}: ${url}`);
      return { modo: 'prueba' as const };
    }
    const logo = logoIncrustado(empresa.logo);
    const { html, texto } = correoAcceso(empresa, cliente, url, !!logo);
    await this.transporte
      .sendMail({
        from: { name: empresa.nombre, address: this.remitente ?? empresa.email },
        replyTo: empresa.email ?? undefined,
        to: para,
        subject: `Tus facturas de ${nombreSinForma(empresa.nombre)}`,
        text: texto,
        html,
        attachments: logo ? [logo] : [],
      })
      .catch((e) => {
        this.log.error(`No se ha podido enviar el acceso al portal a ${para}: ${e.response ?? e.message}`);
        throw new ServiceUnavailableException(motivoFallo(e));
      });
    return { modo: 'real' as const };
  }

  /**
   * Correo con la marca de la empresa que no va ligado a una factura (peticiones de
   * firma, códigos, copias firmadas). En modo prueba se escribe en el registro de la API.
   */
  async enviarSimple(c: {
    para: string;
    asunto: string;
    parrafos: string[];
    boton?: { texto: string; url: string };
    destacado?: string;
    nota?: string;
    adjunto?: { nombre: string; contenido: Buffer };
  }) {
    const empresa = ok(await this.db.from('empresa').select('nombre, email, cif, direccion, cp, ciudad, provincia, telefono, color, logo').eq('id', 1).single()) as any;
    if (!this.transporte) {
      this.log.warn(`Modo prueba (sin SMTP): «${c.asunto}» para ${c.para}${c.boton ? ` · ${c.boton.url}` : ''}${c.destacado ? ` · ${c.destacado}` : ''}`);
      return { modo: 'prueba' as const };
    }
    const logo = logoIncrustado(empresa.logo);
    const { html, texto } = correoSimple(empresa, c, !!logo);
    await this.transporte
      .sendMail({
        from: { name: empresa.nombre, address: this.remitente ?? empresa.email },
        replyTo: empresa.email ?? undefined,
        to: c.para,
        subject: c.asunto,
        text: texto,
        html,
        attachments: [
          ...(c.adjunto ? [{ filename: c.adjunto.nombre, content: c.adjunto.contenido, contentType: 'application/pdf' }] : []),
          ...(logo ? [logo] : []),
        ],
      })
      .catch((e) => {
        this.log.error(`No se ha podido enviar «${c.asunto}» a ${c.para}: ${e.response ?? e.message}`);
        throw new ServiceUnavailableException(motivoFallo(e));
      });
    return { modo: 'real' as const };
  }

  get configurado() {
    return !!this.transporte;
  }

  async enviar(c: Correo) {
    const [empresa, factura] = await Promise.all([
      this.db.from('empresa').select('nombre, email, cif, direccion, cp, ciudad, provincia, telefono, iban, color, logo').eq('id', 1).single().then((r) => ok(r) as any),
      this.db
        .from('facturas')
        .select('numero, fecha, vencimiento, total, periodo, cliente:clientes(id, email, portal_activo, portal_emails)')
        .eq('id', c.factura_id)
        .single()
        .then((r) => ok(r) as any),
    ]);
    const modo = this.transporte ? 'real' : 'prueba';
    let proveedorId: string | null = null;
    if (this.transporte) {
      // Botón al portal (enlace de un solo uso, válido 30 días) si el cliente lo tiene y este correo puede entrar
      const cli = factura.cliente;
      const portal =
        cli?.portal_activo && correosPortal(cli).includes(normalizarEmail(c.para))
          ? await crearEnlacePortal(this.db, this.web ?? '', cli.id, c.para, 30 * 24 * 60).catch(() => null)
          : null;
      const datos: DatosCorreo = { tipo: c.tipo, texto: c.texto, empresa, portal, factura: { ...factura, total: Number(factura.total) } };
      const logo = logoIncrustado(empresa.logo);
      const pdf = c.adjunto && {
        // El cliente ve quién le factura, no su propio nombre
        filename: `${documento(factura)} - ${nombreSinForma(empresa.nombre)}.pdf`.replace(/[\\/:*?"<>|]/g, ''),
        content: Buffer.from(c.adjunto.base64, 'base64'),
        contentType: 'application/pdf',
      };
      const info = await this.transporte
        .sendMail({
          from: { name: empresa.nombre, address: this.remitente ?? empresa.email },
          replyTo: empresa.email ?? undefined,
          to: c.para,
          subject: c.asunto,
          text: correoTexto(datos),
          html: correoHtml(datos, !!logo),
          attachments: [...(pdf ? [pdf] : []), ...(logo ? [logo] : [])],
        })
        .catch((e) => {
          this.log.error(`No se ha podido enviar «${c.asunto}» a ${c.para}: ${e.response ?? e.message}`);
          throw new ServiceUnavailableException(motivoFallo(e));
        });
      // Resend contesta con el id del correo: sirve para casar sus avisos de entrega y rebote
      proveedorId = String(info.response ?? '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? null;
      if (!proveedorId) this.log.warn(`Sin id de Resend en la respuesta: ${info.response}`);
    } else {
      this.log.warn(`Modo prueba (sin SMTP): «${c.asunto}» para ${c.para} no se ha enviado`);
    }
    ok(
      await this.db.from('envios').insert({
        factura_id: c.factura_id,
        tipo: c.tipo,
        para: c.para,
        asunto: c.asunto,
        modo,
        automatico: c.automatico ?? false,
        proveedor_id: proveedorId,
      }),
    );
    return { modo };
  }
}

/** Explica en lenguaje normal por qué no ha salido un correo */
function motivoFallo(e: any): string {
  const codigo = Number(e?.responseCode) || 0;
  if (e?.code === 'EAUTH' || codigo === 535)
    return 'No se ha podido entrar en la cuenta de correo: la contraseña o la clave de envío no es válida. Revisa la configuración del correo.';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(e?.code))
    return 'No se ha podido conectar con el servidor de correo. Inténtalo de nuevo en unos minutos.';
  if (e?.code === 'EENVELOPE' || (codigo >= 550 && codigo < 560))
    return 'El servidor de correo ha rechazado la dirección. Comprueba que el email del destinatario está bien escrito.';
  if (codigo === 421 || codigo === 450 || codigo === 451 || codigo === 452)
    return 'El servidor de correo está ocupado o se ha llegado al límite de envíos de hoy. Inténtalo más tarde.';
  return 'No se ha podido enviar el correo. Inténtalo de nuevo en unos minutos.';
}
