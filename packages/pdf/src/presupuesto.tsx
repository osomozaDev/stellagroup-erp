import { Document, Image, Page, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import { etiquetaNif, FORMAS_PAGO } from '@stella/shared';
import { fecha } from './formato';

/**
 * PDF del presupuesto con el diseño de Stella Group: fondo crema, dorado, títulos con
 * serifa (Fraunces) y las partidas agrupadas en pago único, pago anual y cuota mensual,
 * cada grupo con sus totales. Lo usa la API (descarga, firma y copias firmadas).
 */

export const crema = '#fbf6ee';
export const papel = '#fffdf9';
export const oro = '#b08a52';
export const oroSuave = '#f3e8d6';
export const tinta = '#1d1a16';
export const gris = '#7b746a';
export const linea = '#e9dfcf';

const s = StyleSheet.create({
  pagina: { backgroundColor: crema, paddingTop: 30, paddingBottom: 50, paddingHorizontal: 40, fontFamily: 'Inter', fontSize: 8.5, color: tinta },
  fila: { flexDirection: 'row' },
  serif: { fontFamily: 'Fraunces', fontWeight: 600 },
  etiqueta: { fontSize: 6.5, letterSpacing: 1.1, color: gris, fontWeight: 600, textTransform: 'uppercase' },
  tarjeta: { backgroundColor: papel, borderWidth: 0.8, borderColor: linea, borderRadius: 10 },
  gris: { color: gris },
  pie: { position: 'absolute', bottom: 18, left: 40, right: 40, borderTopWidth: 0.6, borderTopColor: linea, paddingTop: 8, fontSize: 7, color: gris },
});

/** «1.000 €», «79,50 €» */
const precio = (n: number | string) => {
  const v = Number(n);
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions).format(v)} €`;
};
/** «3 nov 2026, 15:36» en hora de Madrid */
const fechaCorta = (f: string) =>
  new Date(f).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const cantidad = (n: number | string) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number(n));

/** De #f2e3cf (arriba) a la crema del papel, en 64 franjas */
export const DEGRADADO = Array.from({ length: 64 }, (_, i) => {
  const t = i / 63;
  const mezcla = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${mezcla(0xf2, 0xfb)}${mezcla(0xe3, 0xf6)}${mezcla(0xcf, 0xee)}`;
});

const GRUPOS = [
  { clave: 'unico', titulo: 'Pago único', sufijo: '' },
  { clave: 'anual', titulo: 'Pago anual', sufijo: '/año' },
  { clave: 'mensual', titulo: 'Cuota mensual', sufijo: '/mes' },
] as const;
const grupoDe = (unidad: string) => (unidad === 'mes' ? 'mensual' : unidad === 'año' ? 'anual' : 'unico');

/** Estrella de cuatro puntas del logotipo */
export const Estrella = ({ tam = 11 }: { tam?: number }) => (
  <Svg width={tam} height={tam} viewBox="0 0 24 24">
    <Path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill={oro} />
  </Svg>
);

const Casilla = ({ t, v, ancho }: { t: string; v?: string | null; ancho?: number | string }) => (
  <View style={{ width: ancho, flexGrow: ancho ? 0 : 1 }}>
    <Text style={s.etiqueta}>{t}</Text>
    <Text style={{ fontSize: 9, minHeight: 14, marginTop: 4, paddingBottom: 3, borderBottomWidth: 0.6, borderBottomColor: linea }}>{v || ' '}</Text>
  </View>
);

/** «Forma de pago: 50 %…» → la parte antes de los dos puntos en negrita, como en la hoja */
const Condicion = ({ texto }: { texto: string }) => {
  const m = texto.match(/^([^:]{2,45}):\s*(.+)$/);
  return (
    <View style={[s.fila, { marginBottom: 4 }]} wrap={false}>
      <Text style={{ width: 9, color: gris }}>•</Text>
      <Text style={{ flex: 1, color: gris }}>
        {m ? <><Text style={{ color: tinta, fontWeight: 600 }}>{m[1]}:</Text> {m[2]}</> : texto}
      </Text>
    </View>
  );
};

const FilaTotal = ({ t, v, grande }: { t: string; v: string; grande?: boolean }) => (
  <View style={[s.fila, { justifyContent: 'space-between', alignItems: 'flex-end', paddingVertical: grande ? 6 : 4, borderBottomWidth: grande ? 1 : 0.6, borderBottomColor: grande ? oro : linea }]}>
    <Text style={grande ? [s.serif, { fontSize: 14 }] : { fontSize: 8.5 }}>{t}</Text>
    <Text style={grande ? [s.serif, { fontSize: 14 }] : { fontWeight: 600 }}>{v}</Text>
  </View>
);

export function PresupuestoPdf({ p, Certificado }: { p: any; Certificado?: (props: { f: any }) => any }) {
  const e = p.empresa ?? {};
  const c = p.cliente ?? {};
  const iva = Number(p.iva_pct ?? 0);
  const ret = Number(p.retencion_pct ?? 0);
  const lineas: any[] = [...(p.lineas ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const grupos = GRUPOS.map((g) => ({ ...g, lineas: lineas.filter((l) => grupoDe(l.unidad) === g.clave) })).filter((g) => g.lineas.length);
  const base = (clave: string) => lineas.filter((l) => grupoDe(l.unidad) === clave).reduce((t, l) => t + Number(l.importe), 0);
  const conIva = (n: number) => Math.round(n * (1 + iva / 100) * 100) / 100;
  const hayCuotas = grupos.some((g) => g.clave !== 'unico');
  const contacto = [e.telefono, e.email].filter(Boolean).join(' · ');
  const direccionCliente = c.lineas ? c.direccion : [c.direccion, [c.cp, c.ciudad].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  // La forma de pago es la del presupuesto: la de las condiciones de siempre, si la hubiera, no se repite
  const formaPago = FORMAS_PAGO[p.forma_pago as keyof typeof FORMAS_PAGO] ?? FORMAS_PAGO.dos;
  const condiciones = [
    `Forma de pago: ${formaPago.condicion}.`,
    ...(e.iban ? [`Pago por transferencia: ${e.iban} (titular: ${e.nombre}).`] : []),
    ...String(p.condiciones || e.condiciones_presupuesto || (iva > 0 ? 'Precios sin IVA.' : '')).split('\n').map((x) => x.trim().replace(/^[-•]\s*/, '')).filter((x) => x && !/^forma de pago/i.test(x)),
  ];
  const firma = p.firma;

  return (
    <Document title={`Presupuesto ${p.numero}`} author={e.nombre} creator="Stella ERP">
      <Page size="A4" style={s.pagina}>
        {/* Degradado suave arriba, como en la hoja de Stella (en franjas: el degradado SVG deja un corte visible) */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          {/* Cada franja pisa un punto a la siguiente para que no queden rayas entre ellas */}
          {DEGRADADO.map((color, i) => <View key={i} style={{ height: 4, marginBottom: -1, backgroundColor: color }} />)}
        </View>

        {/* Cabecera */}
        <View style={[s.fila, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          <View style={[s.fila, { alignItems: 'center', gap: 6 }]}>
            <Estrella tam={13} />
            <Text style={[s.serif, { fontSize: 17 }]}>{e.nombre}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontWeight: 700, fontSize: 8 }}>{e.nombre}</Text>
            {e.cif && <Text style={[s.gris, { fontSize: 7.5, marginTop: 2 }]}>{etiquetaNif(e.cif)} {e.cif}</Text>}
            {contacto && <Text style={[s.gris, { fontSize: 7.5, marginTop: 2 }]}>{contacto}</Text>}
          </View>
        </View>

        <View style={[s.fila, { justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16 }]}>
          <View>
            <Text style={[s.etiqueta, { color: oro, fontSize: 7.5 }]}>{p.titulo}</Text>
            <Text style={[s.serif, { fontSize: 34, marginTop: 1 }]}>Presupuesto</Text>
          </View>
          <View style={[s.fila, { gap: 8 }]}>
            {[['Nº presupuesto', p.numero], ['Fecha', fecha(p.fecha)], ['Válido hasta', p.valido_hasta ? fecha(p.valido_hasta) : '—']].map(([t, v]) => (
              <View key={t} style={{ width: 84 }}>
                <Text style={s.etiqueta}>{t}</Text>
                <Text style={[s.tarjeta, { marginTop: 4, paddingVertical: 6, paddingHorizontal: 7, fontSize: 8.5, fontWeight: 600, borderRadius: 6 }]}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Cliente */}
        <View style={[s.tarjeta, { marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, gap: 6 }]}>
          <View style={[s.fila, { gap: 14 }]}>
            <Casilla t="Cliente · nombre o razón social" v={c.nombre} />
            <Casilla t="NIF / CIF" v={c.cif} ancho={140} />
          </View>
          <View style={[s.fila, { gap: 14 }]}>
            <Casilla t="Dirección" v={direccionCliente} />
            <Casilla t="Proyecto" v={p.titulo} ancho={140} />
          </View>
          <View style={[s.fila, { gap: 14 }]}>
            <Casilla t="Persona de contacto" v={c.contacto} />
            <Casilla t="Teléfono" v={c.telefono} ancho={130} />
            <Casilla t="Email" v={c.email} ancho={140} />
          </View>
        </View>

        {p.introduccion && <Text style={[s.gris, { marginTop: 10, fontSize: 8.5 }]}>{p.introduccion}</Text>}

        {/* Servicios */}
        <View style={[s.fila, { justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }]}>
          <Text style={[s.serif, { fontSize: 15 }]}>
            Servicios <Text style={{ fontFamily: 'Fraunces', fontStyle: 'italic', fontWeight: 500, color: oro }}>propuestos</Text>
          </Text>
          {iva > 0 && <Text style={[s.gris, { fontSize: 7 }]}>Precios sin IVA</Text>}
        </View>
        <View style={[s.fila, { marginTop: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: oro }]}>
          <Text style={[s.etiqueta, { flex: 1, paddingLeft: 8 }]}>Concepto</Text>
          <Text style={[s.etiqueta, { width: 70, textAlign: 'right' }]}>Precio</Text>
          <Text style={[s.etiqueta, { width: 40, textAlign: 'right' }]}>Cant.</Text>
          <Text style={[s.etiqueta, { width: 70, textAlign: 'right', paddingRight: 6 }]}>Importe</Text>
        </View>
        {grupos.map((g) => (
          <View key={g.clave}>
            <View style={{ backgroundColor: oroSuave, paddingVertical: 3, paddingHorizontal: 8 }} minPresenceAhead={30}>
              <Text style={[s.etiqueta, { color: oro }]}>{g.titulo}</Text>
            </View>
            {g.lineas.map((l, i) => {
              const [titulo, ...detalle] = String(l.concepto).split('\n');
              return (
                <View key={i} style={[s.fila, { paddingVertical: 4.5, borderBottomWidth: 0.6, borderBottomColor: linea, alignItems: 'center' }]} wrap={false}>
                  <View style={{ flex: 1, paddingLeft: 8, paddingRight: 10 }}>
                    <Text style={{ fontWeight: 600, fontSize: 9 }}>{titulo}</Text>
                    {detalle.length > 0 && <Text style={[s.gris, { fontSize: 7.5, marginTop: 1.5 }]}>{detalle.join('\n')}</Text>}
                  </View>
                  <Text style={{ width: 70, textAlign: 'right' }}>{precio(l.precio)}{g.sufijo || (l.unidad === 'h' ? '/h' : '')}</Text>
                  <Text style={{ width: 40, textAlign: 'right' }}>{cantidad(l.cantidad)}</Text>
                  <Text style={{ width: 70, textAlign: 'right', paddingRight: 6, fontWeight: 600 }}>{precio(l.importe)}{g.sufijo}</Text>
                </View>
              );
            })}
          </View>
        ))}

        {/* Condiciones y totales */}
        <View style={[s.fila, { gap: 12, marginTop: 12 }]} wrap={false}>
          <View style={[s.tarjeta, { flex: 1.15, paddingVertical: 11, paddingHorizontal: 14 }]}>
            <Text style={[s.serif, { fontSize: 11, marginBottom: 8 }]}>Condiciones</Text>
            {condiciones.map((x, i) => <Condicion key={i} texto={x} />)}
            {p.notas && <Condicion texto={p.notas} />}
          </View>
          <View style={[s.tarjeta, { flex: 1, paddingVertical: 11, paddingHorizontal: 14 }]}>
            {hayCuotas && <Text style={[s.etiqueta, { color: oro, marginBottom: 4 }]}>Pago único</Text>}
            {/* Sin IVA ni retención, solo el total */}
            {(iva > 0 || ret > 0) && <FilaTotal t="Base imponible" v={precio(base('unico'))} />}
            {iva > 0 && <FilaTotal t={`IVA ${cantidad(iva)} %`} v={precio(Math.round(base('unico') * iva) / 100)} />}
            {ret > 0 && <FilaTotal t={`Retención IRPF ${cantidad(ret)} %`} v={`– ${precio(Math.round(base('unico') * ret) / 100)}`} />}
            <FilaTotal t="Total" v={precio(Math.round(base('unico') * (100 + iva - ret)) / 100)} grande />
            {hayCuotas && (
              <>
                <Text style={[s.etiqueta, { color: oro, marginTop: 12, marginBottom: 4 }]}>Cuotas</Text>
                {base('anual') > 0 && <FilaTotal t={iva > 0 ? 'Anual + IVA' : 'Anual'} v={`${precio(conIva(base('anual')))}/año`} />}
                {base('mensual') > 0 && <FilaTotal t={iva > 0 ? 'Mensual + IVA' : 'Mensual'} v={`${precio(conIva(base('mensual')))}/mes`} />}
              </>
            )}
          </View>
        </View>

        {/* Aceptación */}
        <View style={[s.fila, { gap: 16, marginTop: 14 }]} wrap={false}>
          <View style={{ flex: 1 }}>
            <View style={{ height: 34, justifyContent: 'flex-end' }}>
              {firma?.imagen && <Image src={firma.imagen} style={{ height: 32, maxWidth: 150, objectFit: 'contain', objectPositionX: 0 }} />}
            </View>
            <View style={{ borderTopWidth: 0.8, borderTopColor: tinta, paddingTop: 4 }}>
              <Text style={{ fontWeight: 600 }}>Aceptado por el cliente</Text>
              <Text style={[s.gris, { fontSize: 7.5 }]}>{firma ? firma.nombre : 'Nombre y firma'}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ height: 34, justifyContent: 'flex-end' }}>{firma?.nif && <Text style={{ fontSize: 10 }}>{firma.nif}</Text>}</View>
            <View style={{ borderTopWidth: 0.8, borderTopColor: tinta, paddingTop: 4 }}>
              <Text style={{ fontWeight: 600 }}>DNI / NIF</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ height: 34, justifyContent: 'flex-end' }}>{firma && <Text style={{ fontSize: 9 }}>{fechaCorta(firma.firmado_en)}</Text>}</View>
            <View style={{ borderTopWidth: 0.8, borderTopColor: tinta, paddingTop: 4 }}>
              <Text style={{ fontWeight: 600 }}>Fecha de aceptación</Text>
              {firma && <Text style={[s.gris, { fontSize: 7.5 }]}>Firmado electrónicamente</Text>}
            </View>
          </View>
        </View>

        <View style={[s.fila, s.pie, { justifyContent: 'space-between', alignItems: 'center' }]} fixed>
          <View style={[s.fila, { alignItems: 'center', gap: 4 }]}>
            <Estrella tam={7} />
            <Text>{e.nombre} · {p.titulo}</Text>
          </View>
          <Text render={({ pageNumber, totalPages }) => [contacto, totalPages > 1 ? `Página ${pageNumber} de ${totalPages}` : ''].filter(Boolean).join(' · ')} />
        </View>
      </Page>
      {/* El certificado de la firma, en el dorado del presupuesto */}
      {firma && Certificado && <Certificado f={{ ...p, empresa: { ...e, color: oro } }} />}
    </Document>
  );
}
