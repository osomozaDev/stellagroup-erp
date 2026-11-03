import { pdf } from '@react-pdf/renderer';
import { FacturaPdf, nombreArchivoPdf, registrarFuentes } from '@stella/pdf';

/** La plantilla está en @stella/pdf, compartida con la API (envíos desde Telegram) */
export async function crearPdfFactura(f: any) {
  registrarFuentes(`${window.location.origin}/fonts`);
  const blob = await pdf(<FacturaPdf f={f} />).toBlob();
  return new File([blob], nombreArchivoPdf(f), { type: 'application/pdf' });
}
