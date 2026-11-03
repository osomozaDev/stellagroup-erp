/**
 * Diseño del correo de facturas y recordatorios. Tablas y estilos en línea porque
 * Gmail, Outlook y el correo del móvil ignoran casi todo lo demás.
 */

export interface DatosCorreo {
  tipo: 'factura' | 'recordatorio';
  texto: string;
  empresa: {
    nombre: string;
    cif?: string | null;
    direccion?: string | null;
    cp?: string | null;
    ciudad?: string | null;
    provincia?: string | null;
    telefono?: string | null;
    iban?: string | null;
    color?: string | null;
    logo?: string | null;
  };
  /** Enlace directo al portal de clientes (si el cliente lo tiene activo) */
  portal?: string | null;
  factura: {
    numero: string | null;
    fecha: string | null;
    vencimiento: string | null;
    total: number;
    periodo?: string | null;
  };
}

export const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' } as unknown as Intl.NumberFormatOptions).format(n);
export const fechaCorta = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
const fechaLarga = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const hoy = () => new Date().toISOString().slice(0, 10);
const diasDesde = (f: string) => Math.round((Date.parse(hoy()) - Date.parse(f)) / 864e5);

const escapar = (t: string) => t.replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[x]!);
const colorValido = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#006fea');
const ibanBonito = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

/** «Stella Group Soluciones Digitales, S.L.» → «Stella Group Soluciones Digitales» */
export const nombreSinForma = (nombre: string) => nombre.replace(/,?\s*(S\.?L\.?U?\.?|S\.?A\.?U?\.?|S\.?C\.?)$/i, '').trim();

/** Logo guardado como data URL → imagen incrustada en el correo (se ve sin «mostrar imágenes») */
export function logoIncrustado(logo?: string | null) {
  const m = logo?.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  return m ? { cid: 'logo@stellagroup-erp', contentType: m[1], content: Buffer.from(m[2], 'base64'), filename: 'logo' } : null;
}

export function documento(f: DatosCorreo['factura']) {
  return f.numero ? `Factura ${f.numero}` : 'Prefactura';
}

export function asuntoRecordatorio(f: DatosCorreo['factura']) {
  const vence = f.vencimiento ? ` · vencida el ${fechaCorta(f.vencimiento)}` : '';
  return `Recordatorio de pago · ${documento(f)} · ${euros(f.total)}${vence}`;
}

/** Filas del recuadro de resumen, compartidas por la versión HTML y la de texto */
function resumen(d: DatosCorreo) {
  const f = d.factura;
  const filas: [string, string][] = [];
  filas.push([f.numero ? 'Factura' : 'Prefactura', [f.numero ? `Nº ${f.numero}` : '', f.fecha ? fechaLarga(f.fecha) : ''].filter(Boolean).join(' · ')]);
  if (f.vencimiento) filas.push(['Vencimiento', fechaLarga(f.vencimiento)]);
  return filas;
}

function aviso(d: DatosCorreo) {
  const v = d.factura.vencimiento;
  if (d.tipo !== 'recordatorio' || !v) return null;
  const dias = diasDesde(v);
  if (dias <= 0) return 'Esta factura vence hoy.';
  return dias === 1 ? 'Esta factura venció ayer.' : `Esta factura venció hace ${dias} días.`;
}

/** El recordatorio por defecto ya incluye el IBAN en el texto: no lo repetimos */
const mostrarPago = (d: DatosCorreo) => !!d.empresa.iban && !!d.factura.numero && d.factura.total > 0 && !d.texto.replace(/\s/g, '').includes(d.empresa.iban.replace(/\s/g, ''));

function pie(e: DatosCorreo['empresa']) {
  const lugar = [e.direccion, [e.cp, e.ciudad].filter(Boolean).join(' '), e.provincia && e.provincia !== e.ciudad ? `(${e.provincia})` : '']
    .filter(Boolean)
    .join(', ')
    .replace(', (', ' (');
  return [e.nombre, e.cif ? `CIF ${e.cif}` : '', lugar, e.telefono ? `Tel. ${e.telefono}` : ''].filter(Boolean);
}

export function correoHtml(d: DatosCorreo, conLogo: boolean) {
  const color = colorValido(d.empresa.color);
  const fuente = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  // El resumen va justo después del saludo y la frase que presenta la factura
  const bloques = d.texto.split(/\n{2,}/);
  const parrafo = (p: string) => `<p style="margin:0 0 14px">${escapar(p).replace(/\n/g, '<br>')}</p>`;
  const antes = bloques.slice(0, 2).map(parrafo).join('');
  const despues = bloques.slice(2).map(parrafo).join('');
  const filas = resumen(d)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:3px 0;font-size:13px;color:#667085">${k}</td><td align="right" style="padding:3px 0;font-size:13px;color:#101828">${escapar(v)}</td></tr>`,
    )
    .join('');
  const alerta = aviso(d);
  const nombre = escapar(nombreSinForma(d.empresa.nombre));
  const cabecera = conLogo
    ? `<img src="cid:logo@stellagroup-erp" alt="${nombre}" height="56" style="display:block;height:56px;width:auto;border:0">`
    : `<span style="font-size:17px;font-weight:600;color:${color}">${nombre}</span>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f4f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;${fuente}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e7ec">
  <tr><td style="padding:20px 28px;border-bottom:3px solid ${color}">${cabecera}</td></tr>
  <tr><td style="padding:24px 28px 4px;font-size:15px;line-height:1.6;color:#101828">
    ${alerta ? `<p style="margin:0 0 16px;padding:10px 14px;background:#fef6e7;border-radius:8px;color:#93370d;font-size:14px">${alerta}</p>` : ''}
    ${antes}
  </td></tr>
  <tr><td style="padding:0 28px 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;border-radius:10px">
      <tr><td style="padding:14px 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${filas}
          <tr><td style="padding:8px 0 2px;font-size:13px;color:#667085">Importe</td><td align="right" style="padding:8px 0 2px;font-size:22px;font-weight:600;color:#101828">${euros(d.factura.total)}</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
  ${
    mostrarPago(d)
      ? `<tr><td style="padding:12px 28px 4px;font-size:14px;line-height:1.7;color:#101828">
    <span style="font-weight:600">Pago por transferencia</span><br>
    <span style="color:#667085">Titular:</span> ${escapar(d.empresa.nombre)}<br>
    <span style="color:#667085">IBAN:</span> <span style="font-family:Menlo,Consolas,monospace">${escapar(ibanBonito(d.empresa.iban!))}</span><br>
    <span style="color:#667085">Concepto:</span> ${escapar(documento(d.factura))}
  </td></tr>`
      : ''
  }
  ${despues ? `<tr><td style="padding:16px 28px 0;font-size:15px;line-height:1.6;color:#101828">${despues}</td></tr>` : ''}
  ${
    d.portal
      ? `<tr><td style="padding:16px 28px 0;font-size:14px;line-height:1.6;color:#475467">
    <a href="${escapar(d.portal)}" style="display:inline-block;border:1px solid ${color};color:${color};text-decoration:none;font-weight:600;padding:9px 18px;border-radius:8px">Ver todas tus facturas</a>
  </td></tr>`
      : ''
  }
  <tr><td style="padding:0 0 18px"></td></tr>
  <tr><td style="padding:14px 28px;border-top:1px solid #eaecf0;font-size:12px;line-height:1.5;color:#98a2b3">${pie(d.empresa).map(escapar).join(' · ')}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/** Versión sin diseño para los programas de correo que no muestran HTML */
export function correoTexto(d: DatosCorreo) {
  const bloques = d.texto.split(/\n{2,}/);
  const resumenTexto = [...resumen(d).map(([k, v]) => `${k}: ${v}`), `Importe: ${euros(d.factura.total)}`].join('\n');
  const pago = mostrarPago(d)
    ? `Pago por transferencia\nTitular: ${d.empresa.nombre}\nIBAN: ${ibanBonito(d.empresa.iban!)}\nConcepto: ${documento(d.factura)}`
    : null;
  const portal = d.portal ? `Ver y descargar todas tus facturas: ${d.portal}` : null;
  const partes = [aviso(d), ...bloques.slice(0, 2), resumenTexto, pago, ...bloques.slice(2), portal, `—\n${pie(d.empresa).join(' · ')}`];
  return partes.filter(Boolean).join('\n\n');
}

/** Correo con el enlace para entrar en el portal de clientes */
export function correoAcceso(e: DatosCorreo['empresa'], cliente: string, url: string, conLogo: boolean) {
  const color = colorValido(e.color);
  const fuente = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const nombre = escapar(nombreSinForma(e.nombre));
  const cabecera = conLogo
    ? `<img src="cid:logo@stellagroup-erp" alt="${nombre}" height="56" style="display:block;height:56px;width:auto;border:0">`
    : `<span style="font-size:17px;font-weight:600;color:${color}">${nombre}</span>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f4f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;${fuente}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e7ec">
  <tr><td style="padding:20px 28px;border-bottom:3px solid ${color}">${cabecera}</td></tr>
  <tr><td style="padding:24px 28px 8px;font-size:15px;line-height:1.6;color:#101828">
    <p style="margin:0 0 14px">Hola,</p>
    <p style="margin:0 0 20px">Pulsa el botón para ver y descargar las facturas de <b>${escapar(cliente)}</b>.</p>
    <p style="margin:0 0 20px"><a href="${escapar(url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Ver mis facturas</a></p>
    <p style="margin:0 0 18px;font-size:13px;color:#667085">El enlace sirve una vez y caduca en una hora. Si no lo has pedido tú, ignora este correo.</p>
  </td></tr>
  <tr><td style="padding:14px 28px;border-top:1px solid #eaecf0;font-size:12px;line-height:1.5;color:#98a2b3">${pie(e).map(escapar).join(' · ')}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  const texto = `Hola,\n\nEntra aquí para ver y descargar las facturas de ${cliente}:\n${url}\n\nEl enlace sirve una vez y caduca en una hora. Si no lo has pedido tú, ignora este correo.\n\n—\n${pie(e).join(' · ')}`;
  return { html, texto };
}
