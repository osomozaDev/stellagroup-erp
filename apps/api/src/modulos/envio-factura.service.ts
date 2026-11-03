import { BadRequestException, Injectable } from '@nestjs/common';
import { asuntoFactura, mensajeFactura } from '@stella/shared';
import { nombreArchivoPdf, pdfFacturaBuffer, registrarFuentes } from '@stella/pdf';
import { CorreoService } from '../comun/correo.service';
import { TelegramService } from '../comun/telegram.service';
import { FacturasService } from './facturas.service';

/**
 * Manda una factura (o prefactura) al cliente sin pasar por la web: el PDF se
 * genera aquí con la misma plantilla y el correo lleva el mismo texto que desde la app.
 */
@Injectable()
export class EnvioFacturaService {
  private fuentes = false;

  constructor(
    private readonly facturas: FacturasService,
    private readonly correo: CorreoService,
    private readonly telegram: TelegramService,
  ) {}

  /** PDF de la factura generado aquí (el mismo que se adjunta al correo) */
  async pdf(id: string) {
    const f = await this.facturas.ver(id);
    return { f, ...(await this.pdfDe(f)) };
  }

  /** PDF de cualquier documento con la forma de una factura (también presupuestos) */
  async pdfDe(doc: any) {
    this.prepararFuentes();
    return { pdf: await pdfFacturaBuffer(doc), nombre: nombreArchivoPdf(doc) };
  }

  private prepararFuentes() {
    if (this.fuentes) return;
    // Las mismas fuentes que usa la web, servidas por la propia web
    registrarFuentes(`${this.telegram.web}/fonts`);
    this.fuentes = true;
  }

  async enviar(id: string) {
    const f = await this.facturas.ver(id);
    const para = f.cliente?.email;
    if (!para) throw new BadRequestException(`${f.cliente?.nombre ?? 'El cliente'} no tiene correo. Añádelo en su ficha.`);
    if (f.estado === 'anulada') throw new BadRequestException('Esta factura está anulada');
    this.prepararFuentes();
    const pdf = await pdfFacturaBuffer(f);
    const r = await this.correo.enviar({
      factura_id: f.id,
      tipo: 'factura',
      para,
      asunto: asuntoFactura(f),
      texto: mensajeFactura(f),
      adjunto: { nombre: nombreArchivoPdf(f), base64: pdf.toString('base64') },
    });
    return { ...r, para, f };
  }
}
