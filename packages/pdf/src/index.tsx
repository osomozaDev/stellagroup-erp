import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';
import { etiquetaNif } from '@stella/shared';
import { aclarar, euros, fecha, fechaHora, nombreMes, num } from './formato';
import { ContratoPdf } from './contrato';
import { PresupuestoPdf } from './presupuesto';

/**
 * Plantilla del PDF de las facturas y los presupuestos. La usan la web (descargar,
 * compartir, enviar desde la app) y la API (enviar desde Telegram), para que salgan idénticas.
 * Un presupuesto llega con `tipo_documento: 'presupuesto'`.
 */

/** Inter incrustada en el PDF (las fuentes estándar del PDF se ven mal en muchos visores) */
export function registrarFuentes(base: string) {
  Font.register({
    family: 'Inter',
    fonts: [400, 500, 600, 700].map((fontWeight) => ({ src: `${base}/inter-${fontWeight}.woff`, fontWeight })),
  });
  // Títulos con serifa del presupuesto (licencia SIL OFL, ver fonts/fraunces-LICENSE.txt)
  Font.register({
    family: 'Fraunces',
    fonts: [
      { src: `${base}/fraunces-500.woff`, fontWeight: 500 },
      { src: `${base}/fraunces-600.woff`, fontWeight: 600 },
      { src: `${base}/fraunces-500-italic.woff`, fontWeight: 500, fontStyle: 'italic' },
    ],
  });
  // Sin esto react-pdf parte palabras con guiones y deja huecos raros dentro de ellas
  Font.registerHyphenationCallback((palabra) => [palabra]);
}

const gris = '#667085';
const oscuro = '#101828';
const linea = '#eaecf0';

// Ojo: no usar lineHeight. En react-pdf 4.9 duplica el interlineado y, puesto en Page,
// hace desaparecer «Página X de Y». El interlineado por defecto ya queda bien.
const s = StyleSheet.create({
  pagina: { paddingTop: 44, paddingBottom: 64, paddingHorizontal: 48, fontFamily: 'Inter', fontSize: 9, color: oscuro },
  fila: { flexDirection: 'row' },
  texto: { marginBottom: 1 },
  gris: { color: gris, marginBottom: 1 },
  etiqueta: { fontSize: 8, color: gris, marginBottom: 5 },
  fuerte: { fontWeight: 600 },
  caja: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 6 },
  celda: { paddingVertical: 10, paddingHorizontal: 10 },
  pie: { position: 'absolute', bottom: 26, left: 48, right: 48, fontSize: 7.5, color: gris, borderTopWidth: 0.5, borderTopColor: linea, paddingTop: 9 },
});

const lineaDir = (...p: (string | null | undefined)[]) => p.filter(Boolean).join(' ');

export function FacturaPdf({ f }: { f: any }) {
  const e = f.empresa ?? {};
  const c = f.cliente ?? {};
  const color = e.color || '#1f6feb';
  const suave = aclarar(color, 0.93);
  const presupuesto = f.tipo_documento === 'presupuesto';
  const cabecera = presupuesto ? 'Presupuesto' : f.rectifica_id ? 'Factura rectificativa' : f.numero ? 'Factura' : 'Prefactura';

  return (
    <Document title={titulo(f)} author={e.nombre} creator="Stella ERP">
      <Page size="A4" style={s.pagina}>
        {/* Cabecera: logo y emisor a la izquierda, datos de la factura a la derecha */}
        <View style={[s.fila, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          <View style={{ maxWidth: 300 }}>
            {e.logo && <Image src={e.logo} style={{ height: 56, maxWidth: 230, objectFit: 'contain', objectPositionX: 0, marginBottom: 8 }} />}
            <Text style={[s.fuerte, { fontSize: 10, marginBottom: 2 }]}>{e.nombre}</Text>
            {e.cif && <Text style={s.gris}>CIF {e.cif}</Text>}
            {e.direccion && <Text style={s.gris}>{e.direccion}</Text>}
            <Text style={s.gris}>{lineaDir(e.cp, e.ciudad, e.provincia && `(${e.provincia})`)}</Text>
            {(e.telefono || e.email) && <Text style={s.gris}>{[e.telefono, e.email].filter(Boolean).join(' · ')}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end', width: 190 }}>
            <Text style={{ fontSize: f.rectifica_id ? 14 : 18, fontWeight: 700, color }}>{cabecera}</Text>
            <Text style={{ fontSize: f.numero ? 13 : 9, fontWeight: f.numero ? 600 : 400, color: f.numero ? oscuro : gris, marginTop: 2, marginBottom: 10 }}>
              {f.numero ? `Nº ${f.numero}` : 'Pendiente de emitir'}
            </Text>
            <Dato t="Fecha" v={fecha(f.fecha)} />
            {f.rectificada && <Dato t="Rectifica a" v={`Nº ${f.rectificada.numero} · ${fecha(f.rectificada.fecha)}`} />}
            {f.vencimiento && <Dato t="Vencimiento" v={fecha(f.vencimiento)} />}
            {f.valido_hasta && <Dato t="Válido hasta" v={fecha(f.valido_hasta)} />}
            {f.periodo && <Dato t="Periodo" v={nombreMes(f.periodo).replace(/^./, (x) => x.toUpperCase())} />}
          </View>
        </View>

        {/* Cliente y proyecto */}
        <View style={[s.fila, { gap: 12, marginTop: 24 }]}>
          <View style={[s.caja, { backgroundColor: suave }]}>
            <Text style={s.etiqueta}>{presupuesto ? 'Cliente' : 'Facturar a'}</Text>
            <Text style={[s.fuerte, { fontSize: 10, marginBottom: 2 }]}>{c.nombre}</Text>
            {/* Cliente escrito a mano en el presupuesto: sus líneas tal cual */}
            {c.lineas ? c.lineas.map((l: string, i: number) => <Text key={i} style={s.texto}>{l}</Text>) : (
              <>
                {c.cif && <Text style={s.texto}>CIF {c.cif}</Text>}
                {c.direccion && <Text style={s.texto}>{c.direccion}</Text>}
                <Text style={s.texto}>{lineaDir(c.cp, c.ciudad, c.provincia && `(${c.provincia})`)}</Text>
              </>
            )}
          </View>
          {(f.proyecto || presupuesto) && (
            <View style={[s.caja, { backgroundColor: suave }]}>
              <Text style={s.etiqueta}>Proyecto</Text>
              <Text style={[s.fuerte, { fontSize: 10, marginBottom: 2 }]}>{presupuesto ? f.titulo : f.proyecto.nombre}</Text>
              {!presupuesto && f.proyecto.referencia && <Text style={s.texto}>Ref. {f.proyecto.referencia}</Text>}
            </View>
          )}
        </View>

        {presupuesto && f.introduccion && <Text style={{ marginTop: 16 }}>{f.introduccion}</Text>}

        {/* Líneas */}
        <View style={{ marginTop: 16 }}>
          <View style={[s.fila, { borderBottomWidth: 1.2, borderBottomColor: color }]} fixed>
            <Text style={[s.celda, s.fuerte, { flex: 1, paddingLeft: 0, color }]}>Concepto</Text>
            <Text style={[s.celda, s.fuerte, { width: 72, textAlign: 'right', color }]}>Cantidad</Text>
            <Text style={[s.celda, s.fuerte, { width: 72, textAlign: 'right', color }]}>Precio</Text>
            <Text style={[s.celda, s.fuerte, { width: 86, textAlign: 'right', paddingRight: 0, color }]}>Importe</Text>
          </View>
          {f.lineas?.map((l: any) => (
            <View key={l.id} style={[s.fila, { borderBottomWidth: 0.5, borderBottomColor: linea }]} wrap={false}>
              <Text style={[s.celda, s.texto, { flex: 1, paddingLeft: 0 }]}>{l.concepto}</Text>
              <Text style={[s.celda, { width: 72, textAlign: 'right' }]}>
                {num(l.cantidad)}{l.unidad && l.unidad !== 'ud' ? ` ${l.unidad}` : ''}
              </Text>
              <Text style={[s.celda, { width: 72, textAlign: 'right' }]}>{euros(l.precio)}</Text>
              <Text style={[s.celda, s.fuerte, { width: 86, textAlign: 'right', paddingRight: 0 }]}>{euros(l.importe)}</Text>
            </View>
          ))}
        </View>

        {/* Totales */}
        <View style={[s.fila, { marginTop: 18, justifyContent: 'flex-end' }]} wrap={false}>
          <View style={{ width: 240 }}>
            <Total t="Base imponible" v={euros(f.base)} />
            <Total t={`IVA ${num(f.iva_pct)} %`} v={euros(f.iva_importe)} />
            {Number(f.retencion_pct) > 0 && <Total t={`Retención IRPF ${num(f.retencion_pct)} %`} v={`– ${euros(f.retencion_importe)}`} />}
            <View style={[s.fila, { justifyContent: 'space-between', alignItems: 'center', backgroundColor: color, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 14, marginTop: 10 }]}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 600 }}>Total</Text>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{euros(f.total)}</Text>
            </View>
          </View>
        </View>

        {/* Presupuesto: condiciones y aceptación */}
        {presupuesto && (
          <View style={{ marginTop: 30 }} wrap={false}>
            <View style={{ paddingTop: 14, borderTopWidth: 0.5, borderTopColor: linea }}>
              <Text style={s.etiqueta}>Condiciones</Text>
              <Text>{f.condiciones || e.condiciones_presupuesto || 'Precios sin IVA salvo que se indique. Forma de pago: 50 % al aceptar y 50 % a la entrega.'}</Text>
            </View>
            {f.notas && <Text style={[s.gris, { marginTop: 14 }]}>{f.notas}</Text>}
            <Firmas f={f} />
          </View>
        )}

        {/* Pago y notas */}
        {!presupuesto && <View style={{ marginTop: 30 }} wrap={false}>
          <View style={[s.fila, { gap: 32, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: linea }]}>
            <View>
              <Text style={s.etiqueta}>Forma de pago</Text>
              <Text>{e.forma_pago}</Text>
            </View>
            {e.iban && (
              <View>
                <Text style={s.etiqueta}>IBAN</Text>
                <Text style={s.fuerte}>{e.iban}</Text>
              </View>
            )}
          </View>
          {f.motivo_rectificacion && (
            <Text style={[s.gris, { marginTop: 14 }]}>Factura rectificativa de la Nº {f.rectificada?.numero} por: {f.motivo_rectificacion}</Text>
          )}
          {f.notas && <Text style={[s.gris, { marginTop: 14 }]}>{f.notas}</Text>}
          {!f.numero && (
            <Text style={[s.gris, { marginTop: 14, fontSize: 8 }]}>
              Documento de conformidad previo a la factura. No tiene validez como factura hasta su emisión.
            </Text>
          )}
        </View>}

        <View style={[s.fila, s.pie]} fixed>
          <Text style={{ flex: 1, paddingRight: 20 }}>{e.pie_factura || `${e.nombre}${e.cif ? ` · CIF ${e.cif}` : ''}`}</Text>
          <Text style={{ width: 90, textAlign: 'right' }} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
      {f.firma && <PaginaCertificado f={f} />}
    </Document>
  );
}

const Dato = ({ t, v }: { t: string; v: string }) => (
  <View style={[s.fila, { justifyContent: 'space-between', width: '100%', marginTop: 3 }]}>
    <Text style={{ color: gris }}>{t}</Text>
    <Text style={s.fuerte}>{v}</Text>
  </View>
);

const Total = ({ t, v }: { t: string; v: string }) => (
  <View style={[s.fila, { justifyContent: 'space-between', paddingVertical: 4, paddingLeft: 14 }]}>
    <Text style={{ color: gris }}>{t}</Text>
    <Text style={s.fuerte}>{v}</Text>
  </View>
);

export const nombreArchivoPdf = (f: any) =>
  `${titulo(f)} - ${f.cliente?.nombre ?? ''}`.replace(/[\\/:*?"<>|]/g, '').replace(/[.\s]+$/, '') + '.pdf';

export const titulo = (f: any) => (f.tipo_documento === 'contrato' ? `Contrato ${f.numero}` : f.tipo_documento === 'presupuesto' ? `Presupuesto ${f.numero}` : f.rectifica_id ? `Rectificativa ${f.numero}` : f.numero ? `Factura ${f.numero}` : `Prefactura ${f.periodo ? nombreMes(f.periodo) : ''}`.trim());

/** Solo en el servidor: el PDF como Buffer (facturas, presupuestos y contratos) */
export function pdfFacturaBuffer(f: any) {
  if (f.tipo_documento === 'presupuesto') return renderToBuffer(<PresupuestoPdf p={f} Certificado={PaginaCertificado} />);
  return renderToBuffer(f.tipo_documento === 'contrato' ? <ContratoPdf c={f} Certificado={PaginaCertificado} /> : <FacturaPdf f={f} />);
}

// ───────────── Contratos y firma electrónica ─────────────

/** Recuadros de firma: la empresa y el cliente (con su firma, si ya ha firmado) */
function Firmas({ f }: { f: any }) {
  const e = f.empresa ?? {};
  const firma = f.firma;
  return (
    <View style={[s.fila, { gap: 24, marginTop: 30 }]} wrap={false}>
      <View style={{ flex: 1 }}>
        <View style={{ height: 64 }} />
        <View style={{ borderTopWidth: 0.5, borderTopColor: gris, paddingTop: 6 }}>
          <Text style={s.fuerte}>{e.nombre}</Text>
          {e.cif && <Text style={s.gris}>CIF {e.cif}</Text>}
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ height: 64, justifyContent: 'flex-end' }}>
          {firma?.imagen && <Image src={firma.imagen} style={{ height: 60, maxWidth: 200, objectFit: 'contain', objectPositionX: 0 }} />}
        </View>
        <View style={{ borderTopWidth: 0.5, borderTopColor: gris, paddingTop: 6 }}>
          {firma ? (
            <>
              <Text style={s.fuerte}>{firma.nombre}{firma.nif ? ` · ${firma.nif}` : ''}</Text>
              <Text style={s.gris}>Por {f.cliente?.nombre} · firmado electrónicamente el {fechaHora(firma.firmado_en)}</Text>
            </>
          ) : (
            <>
              <Text style={s.fuerte}>{f.cliente?.nombre}</Text>
              <Text style={s.gris}>Firma y fecha</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

/** Última página: quién, cuándo, desde dónde y la huella del documento firmado */
function PaginaCertificado({ f }: { f: any }) {
  const e = f.empresa ?? {};
  const x = f.firma;
  const color = e.color || '#1f6feb';
  const filas: [string, string][] = [
    ['Documento', `${titulo(f)} · ${f.titulo ?? ''}`],
    ['Emisor', `${e.nombre}${e.cif ? ` · ${etiquetaNif(e.cif)} ${e.cif}` : ''}`],
    ['Firmante', `${x.nombre}${x.nif ? ` · NIF ${x.nif}` : ''}${f.cliente?.nombre ? ` · en nombre de ${f.cliente.nombre}` : ''}`],
    ['Correo verificado', x.email],
    ['Enviado para firmar', `${fechaHora(x.enviado_en)}${x.enviado_por ? ` por ${x.enviado_por}` : ''}`],
    ['Abierto por el firmante', fechaHora(x.visto_en)],
    ['Código por correo verificado', fechaHora(x.verificado_en)],
    ['Firmado', fechaHora(x.firmado_en)],
    ['Dirección IP', x.ip ?? '—'],
    ['Navegador', x.navegador ?? '—'],
    ['Huella del documento (SHA-256)', x.huella],
    ['Identificador de la firma', x.id],
  ];
  return (
    <Page size="A4" style={s.pagina}>
      <Text style={{ fontSize: 16, fontWeight: 700, color }}>Certificado de firma electrónica</Text>
      <Text style={[s.gris, { marginTop: 4, marginBottom: 18 }]}>Evidencias de la firma de este documento, registradas por {e.nombre}.</Text>
      {filas.map(([t, v]) => (
        <View key={t} style={[s.fila, { borderBottomWidth: 0.5, borderBottomColor: linea, paddingVertical: 7 }]} wrap={false}>
          <Text style={{ width: 160, color: gris }}>{t}</Text>
          <Text style={{ flex: 1, fontWeight: 500 }}>{v}</Text>
        </View>
      ))}
      <View style={{ marginTop: 18 }} wrap={false}>
        <Text style={s.etiqueta}>Firma manuscrita</Text>
        {x.imagen && <Image src={x.imagen} style={{ height: 80, maxWidth: 260, objectFit: 'contain', objectPositionX: 0 }} />}
      </View>
      <Text style={[s.gris, { marginTop: 22, fontSize: 8 }]}>
        Firma electrónica conforme al artículo 25 del Reglamento (UE) 910/2014 (eIDAS) y a la Ley 6/2020. El firmante accedió con un enlace personal enviado a su
        correo, confirmó su identidad con un código de un solo uso enviado a esa misma dirección, aceptó expresamente el contenido y firmó a mano en la pantalla.
        La huella SHA-256 identifica el contenido exacto que se firmó: cualquier cambio posterior daría una huella distinta.
      </Text>
      <View style={[s.fila, s.pie]} fixed>
        <Text style={{ flex: 1, paddingRight: 20 }}>{e.nombre} · Certificado de firma {x.id}</Text>
        <Text style={{ width: 90, textAlign: 'right' }} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </View>
    </Page>
  );
}
