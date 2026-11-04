import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { bloquesContrato, BloqueContrato, etiquetaNif, ParteTexto } from '@stella/shared';
import { fecha, fechaHora } from './formato';
import { DEGRADADO, Estrella, gris, linea, oro, oroSuave, tinta } from './presupuesto';

/**
 * PDF del contrato con el diseño de Stella Group (el del contrato en papel): degradado crema
 * arriba, estrella dorada, títulos con serifa y la última parte en cursiva dorada, las partes en
 * recuadros y las cláusulas numeradas en dorado. El texto sale del cuerpo del contrato
 * («# título», «## apartado», párrafos y «- » listas), así sirve para cualquier plantilla.
 */

const s = StyleSheet.create({
  pagina: { backgroundColor: '#ffffff', paddingTop: 30, paddingBottom: 54, paddingHorizontal: 44, fontFamily: 'Inter', fontSize: 8.5, color: tinta },
  fila: { flexDirection: 'row' },
  serif: { fontFamily: 'Fraunces', fontWeight: 600 },
  cursiva: { fontFamily: 'Fraunces', fontStyle: 'italic', fontWeight: 500, color: oro },
  etiqueta: { fontSize: 6.5, letterSpacing: 1.4, color: oro, fontWeight: 600, textTransform: 'uppercase' },
  parrafo: { marginBottom: 6, textAlign: 'justify' },
  gris: { color: gris },
  fuerte: { fontWeight: 600 },
  pie: { position: 'absolute', bottom: 20, left: 44, right: 44, borderTopWidth: 0.6, borderTopColor: linea, paddingTop: 8, fontSize: 7, color: gris },
});

const Rico = ({ partes }: { partes: ParteTexto[] }) => (
  <>{partes.map((p, i) => <Text key={i} style={p.negrita ? s.fuerte : undefined}>{p.texto}</Text>)}</>
);
const plano = (partes: ParteTexto[]) => partes.map((p) => p.texto).join('');

/** «Contrato de prestación de servicios de diseño…» → recto hasta el último «de» (o «y»), y el resto en cursiva */
const dividir = (t: string, corte: string[]) => {
  for (const c of corte) {
    const i = t.lastIndexOf(c);
    if (i > 8) return [t.slice(0, i + (c === ' de ' ? c.length : 1)), t.slice(i + (c === ' de ' ? c.length : 1))];
  }
  return [t, ''];
};

const TituloSerif = ({ texto, tam, corte }: { texto: string; tam: number; corte: string[] }) => {
  const [recto, cursiva] = dividir(texto, corte);
  return (
    <Text style={[s.serif, { fontSize: tam }]}>
      {recto}
      {cursiva && <Text style={s.cursiva}>{cursiva}</Text>}
    </Text>
  );
};

/** «Reunidos», «Exponen», «Cláusulas»: dorado, centrado y espaciado */
const Seccion = ({ texto }: { texto: string }) => (
  <Text style={[s.etiqueta, { textAlign: 'center', marginTop: 12, marginBottom: 8 }]} minPresenceAhead={40}>{texto}</Text>
);

/** «1. Objeto»: el número en dorado y una raya fina debajo */
const Clausula = ({ numero, texto }: { numero: string; texto: string }) => (
  <View style={{ marginTop: 10, marginBottom: 6, paddingBottom: 4, borderBottomWidth: 0.6, borderBottomColor: linea }} minPresenceAhead={50}>
    <Text style={[s.serif, { fontSize: 13 }]}>
      <Text style={{ color: oro }}>{numero} </Text>
      {texto}
    </Text>
  </View>
);

/** «Anexo I · Servicios contratados y precios» */
const Anexo = ({ etiqueta, texto }: { etiqueta: string; texto: string }) => (
  <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 0.6, borderTopColor: linea, marginBottom: 8 }} minPresenceAhead={60}>
    <Text style={[s.etiqueta, { marginBottom: 3 }]}>{etiqueta}</Text>
    <TituloSerif texto={texto} tam={17} corte={[' y ', ' (']} />
  </View>
);

/** Las partes, cada una en su recuadro */
const Parte = ({ titulo, partes }: { titulo: string; partes: ParteTexto[] }) => (
  <View style={{ borderWidth: 0.8, borderColor: linea, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11, marginBottom: 7 }} wrap={false}>
    <Text style={[s.etiqueta, { marginBottom: 5 }]}>{titulo}</Text>
    <Text style={{ textAlign: 'justify' }}><Rico partes={partes} /></Text>
  </View>
);

/** «Cuenta para los pagos: ES31 … · Titular: …»: el IBAN en grande, en su recuadro, para que se copie sin errores */
const Cuenta = ({ texto }: { texto: string }) => {
  const [iban, titular] = texto.replace(/^Cuenta para los pagos:\s*/i, '').split(/\s*·\s*Titular:\s*/i);
  return (
    <View style={{ borderWidth: 0.8, borderColor: oro, borderRadius: 8, backgroundColor: oroSuave, paddingVertical: 9, paddingHorizontal: 12, marginTop: 2, marginBottom: 8 }} wrap={false}>
      <Text style={[s.etiqueta, { marginBottom: 4 }]}>Cuenta para los pagos · transferencia bancaria</Text>
      <Text style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.6 }}>{iban}</Text>
      {titular && <Text style={[s.gris, { marginTop: 3 }]}>Titular: {titular}</Text>}
    </View>
  );
};

const Punto = ({ partes }: { partes: ParteTexto[] }) => (
  <View style={[s.fila, { marginBottom: 3, paddingLeft: 4 }]}>
    <Text style={{ width: 10, color: oro, fontWeight: 700 }}>•</Text>
    <Text style={{ flex: 1, textAlign: 'justify' }}><Rico partes={partes} /></Text>
  </View>
);

/** Una partida del Anexo: «**Web**: detalle · 1.000,00 € + IVA» → concepto a la izquierda y precio a la derecha */
const Partida = ({ partes }: { partes: ParteTexto[] }) => {
  const ultimo = partes[partes.length - 1];
  const i = ultimo?.negrita ? -1 : ultimo.texto.lastIndexOf(' · ');
  if (i < 0) return <Punto partes={partes} />;
  const concepto = [...partes.slice(0, -1), { texto: ultimo.texto.slice(0, i) }];
  return (
    <View style={[s.fila, { paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.6, borderBottomColor: linea, gap: 12 }]} wrap={false}>
      <Text style={{ flex: 1 }}><Rico partes={concepto} /></Text>
      <Text style={[s.fuerte, { textAlign: 'right' }]}>{ultimo.texto.slice(i + 3)}</Text>
    </View>
  );
};

/** «Pago único», «Pago anual»…: la franja de cada grupo de partidas */
const Grupo = ({ texto }: { texto: string }) => (
  <Text style={[s.etiqueta, { backgroundColor: oroSuave, paddingVertical: 4, paddingHorizontal: 8, marginTop: 6 }]} minPresenceAhead={30}>{texto}</Text>
);

function Cuerpo({ bloques, firmas }: { bloques: BloqueContrato[]; firmas: any }) {
  let seccion = '';
  // Las firmas van tras el texto del contrato, antes de los anexos (o al final si no hay)
  const primerAnexo = bloques.findIndex((b) => b.tipo === 'apartado' && /^Anexo [IVX]+/i.test(plano(b.partes)));
  return (
    <>
      {bloques.map((b, i) => {
        const t = plano(b.partes);
        if (b.tipo === 'apartado') {
          const anexo = t.match(/^(Anexo [IVX]+)\s*[·:.-]\s*(.+)$/i);
          const numero = t.match(/^(\d+\.)\s*(.+)$/);
          seccion = anexo ? 'anexo' : numero ? 'clausulas' : t.toLowerCase();
          if (anexo) return i === primerAnexo ? <View key={i}>{firmas}<Anexo etiqueta={anexo[1]} texto={anexo[2]} /></View> : <Anexo key={i} etiqueta={anexo[1]} texto={anexo[2]} />;
          if (numero) return <Clausula key={i} numero={numero[1]} texto={numero[2]} />;
          return <Seccion key={i} texto={t} />;
        }
        if (b.tipo === 'lista') return seccion === 'anexo' ? <Partida key={i} partes={b.partes} /> : <Punto key={i} partes={b.partes} />;
        if (b.tipo === 'parrafo') {
          if (seccion === 'reunidos' && /^De una parte/i.test(t)) return <Parte key={i} titulo="El Prestador" partes={b.partes} />;
          if (seccion === 'reunidos' && /^De otra parte/i.test(t)) return <Parte key={i} titulo="El Cliente" partes={b.partes} />;
          if (/^Cuenta para los pagos:/i.test(t)) return <Cuenta key={i} texto={t} />;
          // Un párrafo que es solo una negrita corta en el Anexo es el nombre de un grupo de partidas
          if (seccion === 'anexo' && b.partes.length === 1 && b.partes[0].negrita && t.length < 40) return <Grupo key={i} texto={t} />;
          return <Text key={i} style={s.parrafo}><Rico partes={b.partes} /></Text>;
        }
        return null;
      })}
      {primerAnexo < 0 && firmas}
    </>
  );
}

/** Las firmas: el Prestador y el Cliente (con su firma, si ya ha firmado) */
function Firmas({ c }: { c: any }) {
  const e = c.empresa ?? {};
  const firma = c.firma;
  return (
    <View style={[s.fila, { gap: 28, marginTop: 26 }]} wrap={false}>
      <View style={{ flex: 1 }}>
        <View style={{ height: 56 }} />
        <View style={{ borderTopWidth: 0.8, borderTopColor: tinta, paddingTop: 6 }}>
          <Text style={s.fuerte}>El Prestador · {e.nombre}</Text>
          <Text style={s.gris}>{e.cif ? `${etiquetaNif(e.cif)} ${e.cif}` : 'Nombre, firma y DNI'}</Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ height: 56, justifyContent: 'flex-end' }}>
          {firma?.imagen && <Image src={firma.imagen} style={{ height: 52, maxWidth: 200, objectFit: 'contain', objectPositionX: 0 }} />}
        </View>
        <View style={{ borderTopWidth: 0.8, borderTopColor: tinta, paddingTop: 6 }}>
          {firma ? (
            <>
              <Text style={s.fuerte}>El Cliente · {firma.nombre}{firma.nif ? ` · ${firma.nif}` : ''}</Text>
              <Text style={s.gris}>Por {c.cliente?.nombre} · firmado electrónicamente el {fechaHora(firma.firmado_en)}</Text>
            </>
          ) : (
            <>
              <Text style={s.fuerte}>El Cliente · {c.cliente?.nombre}</Text>
              <Text style={s.gris}>Nombre, firma y DNI</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

export function ContratoPdf({ c, Certificado }: { c: any; Certificado?: (props: { f: any }) => any }) {
  const e = c.empresa ?? {};
  const contacto = [e.telefono, e.email].filter(Boolean).join(' · ');
  const bloques = bloquesContrato(c.cuerpo ?? '');
  const titulo = bloques.find((b) => b.tipo === 'titulo');
  const resto = bloques.filter((b) => b !== titulo);
  return (
    <Document title={`Contrato ${c.numero}`} author={e.nombre} creator="Stella ERP">
      <Page size="A4" style={s.pagina}>
        {/* Degradado crema arriba de la primera página, como en el contrato en papel */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          {DEGRADADO.map((color, i) => <View key={i} style={{ height: 3, marginBottom: -1, backgroundColor: color }} />)}
        </View>

        <View style={[s.fila, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          {e.logo ? (
            <Image src={e.logo} style={{ height: 34, maxWidth: 200, objectFit: 'contain', objectPositionX: 0 }} />
          ) : (
            <View style={[s.fila, { alignItems: 'center', gap: 6 }]}>
              <Estrella tam={13} />
              <Text style={[s.serif, { fontSize: 17 }]}>{e.nombre}</Text>
            </View>
          )}
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontWeight: 700, fontSize: 8 }}>{e.nombre}</Text>
            {e.cif && <Text style={[s.gris, { fontSize: 7.5, marginTop: 2 }]}>{etiquetaNif(e.cif)} {e.cif}</Text>}
            {contacto && <Text style={[s.gris, { fontSize: 7.5, marginTop: 2 }]}>{contacto}</Text>}
          </View>
        </View>

        <View style={{ marginTop: 18, marginBottom: 10 }}>
          <Text style={[s.etiqueta, { marginBottom: 4 }]}>Contrato nº {c.numero} · {fecha(c.fecha)}</Text>
          {titulo && <TituloSerif texto={plano(titulo.partes)} tam={24} corte={[' de ']} />}
        </View>

        <Cuerpo bloques={resto} firmas={<Firmas c={c} />} />

        <View style={[s.fila, s.pie, { justifyContent: 'space-between' }]} fixed>
          <View style={[s.fila, { alignItems: 'center', gap: 4, flex: 1, paddingRight: 20 }]}>
            <Estrella tam={7} />
            <Text>{c.firma ? `Firmado electrónicamente · huella ${c.firma.huella.slice(0, 16)}…` : `${e.nombre} · Contrato ${c.numero}`}</Text>
          </View>
          <Text style={{ width: 90, textAlign: 'right' }} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
      {/* El certificado de la firma, en el dorado del contrato */}
      {c.firma && Certificado && <Certificado f={{ ...c, empresa: { ...e, color: oro } }} />}
    </Document>
  );
}
