import { aclarar, euros, fecha, nombreMes, num } from '../lib/formato';

/** Vista en pantalla de la factura o el presupuesto. Imita el PDF (@stella/pdf): si cambias uno, cambia el otro. */
export default function FacturaDocumento({ f }: { f: any }) {
  const e = f.empresa ?? {};
  const c = f.cliente ?? {};
  const color = e.color || '#1f6feb';
  const suave = aclarar(color, 0.93);
  const presupuesto = f.tipo_documento === 'presupuesto';
  const linea = (...partes: (string | null | undefined)[]) => partes.filter(Boolean).join(' ');

  return (
    <div className="@container">
      <article className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 @2xl:p-10 text-[13px] text-slate-900">
        <header className="flex flex-col @lg:flex-row @lg:justify-between gap-6">
          <div className="text-slate-500 leading-5">
            {e.logo && <img src={e.logo} alt="" className="h-16 max-w-64 object-contain object-left mb-2" />}
            <p className="text-sm font-semibold text-slate-900 mb-0.5">{e.nombre}</p>
            {e.cif && <p>CIF {e.cif}</p>}
            {e.direccion && <p>{e.direccion}</p>}
            <p>{linea(e.cp, e.ciudad, e.provincia && `(${e.provincia})`)}</p>
            <p>{[e.telefono, e.email].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="@lg:w-56 @lg:text-right">
            <p className="text-2xl font-bold" style={{ color }}>{presupuesto ? 'Presupuesto' : f.rectifica_id ? 'Factura rectificativa' : f.numero ? 'Factura' : 'Prefactura'}</p>
            {f.numero ? <p className="text-lg font-semibold mb-3">Nº {f.numero}</p> : <p className="text-slate-500 mb-3">Pendiente de emitir</p>}
            <dl className="space-y-0.5">
              <Dato t="Fecha" v={fecha(f.fecha)} />
              {f.rectificada && <Dato t="Rectifica a" v={`Nº ${f.rectificada.numero} · ${fecha(f.rectificada.fecha)}`} />}
              {f.vencimiento && <Dato t="Vencimiento" v={fecha(f.vencimiento)} />}
              {f.valido_hasta && <Dato t="Válido hasta" v={fecha(f.valido_hasta)} />}
              {f.periodo && <Dato t="Periodo" v={<span className="capitalize">{nombreMes(f.periodo)}</span>} />}
            </dl>
          </div>
        </header>

        <section className="mt-6 grid @lg:grid-cols-2 gap-3">
          <div className="rounded-lg p-4" style={{ background: suave }}>
            <p className="text-xs text-slate-500 mb-1">{presupuesto ? 'Cliente' : 'Facturar a'}</p>
            <p className="font-semibold">{c.nombre}</p>
            {c.cif && <p>CIF {c.cif}</p>}
            <p>{c.direccion}</p>
            <p>{linea(c.cp, c.ciudad, c.provincia && `(${c.provincia})`)}</p>
          </div>
          {(f.proyecto || presupuesto) && (
            <div className="rounded-lg p-4" style={{ background: suave }}>
              <p className="text-xs text-slate-500 mb-1">Proyecto</p>
              <p className="font-semibold">{presupuesto ? f.titulo : f.proyecto.nombre}</p>
              {!presupuesto && f.proyecto.referencia && <p>Ref. {f.proyecto.referencia}</p>}
            </div>
          )}
        </section>

        {presupuesto && f.introduccion && <p className="mt-5 whitespace-pre-line leading-6">{f.introduccion}</p>}

        <table className="mt-4 w-full">
          <thead>
            <tr className="text-left font-semibold border-b-[1.5px]" style={{ color, borderColor: color }}>
              <th className="py-2.5 pr-3 font-semibold">Concepto</th>
              <th className="py-2.5 px-3 font-semibold text-right">Cantidad</th>
              <th className="py-2.5 px-3 font-semibold text-right hidden @lg:table-cell">Precio</th>
              <th className="py-2.5 pl-3 font-semibold text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {f.lineas?.map((l: any) => (
              <tr key={l.id} className="border-b border-slate-100 align-top">
                <td className="py-3 pr-3 whitespace-pre-line leading-5">
                  {l.concepto}
                  <span className="@lg:hidden block text-xs text-slate-500 mt-1">{euros(l.precio)} / {l.unidad}</span>
                </td>
                <td className="py-3 px-3 text-right whitespace-nowrap">{num(l.cantidad)}{l.unidad && l.unidad !== 'ud' ? ` ${l.unidad}` : ''}</td>
                <td className="py-3 px-3 text-right whitespace-nowrap hidden @lg:table-cell">{euros(l.precio)}</td>
                <td className="py-3 pl-3 text-right whitespace-nowrap font-semibold">{euros(l.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-5 flex justify-end">
          <dl className="w-full @lg:w-80 space-y-1.5">
            <Fila t="Base imponible" v={euros(f.base)} />
            <Fila t={`IVA ${num(f.iva_pct)} %`} v={euros(f.iva_importe)} />
            {Number(f.retencion_pct) > 0 && <Fila t={`Retención IRPF ${num(f.retencion_pct)} %`} v={`– ${euros(f.retencion_importe)}`} />}
            <div className="flex items-center justify-between rounded-lg px-4 py-3 mt-3 text-white" style={{ background: color }}>
              <dt className="font-semibold">Total</dt>
              <dd className="text-xl font-bold">{euros(f.total)}</dd>
            </div>
          </dl>
        </section>

        {presupuesto ? (
          <footer className="mt-8 pt-4 border-t border-slate-100 space-y-4">
            <div>
              <p className="text-xs text-slate-500">Condiciones</p>
              <p className="whitespace-pre-line">{f.condiciones || e.condiciones_presupuesto || 'Precios sin IVA salvo que se indique. Forma de pago: 50 % al aceptar y 50 % a la entrega.'}</p>
            </div>
            {f.notas && <p className="text-slate-500 whitespace-pre-line">{f.notas}</p>}
          </footer>
        ) : (
        <footer className="mt-8 pt-4 border-t border-slate-100 space-y-4">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <div>
              <p className="text-xs text-slate-500">Forma de pago</p>
              <p>{e.forma_pago}</p>
            </div>
            {e.iban && (
              <div>
                <p className="text-xs text-slate-500">IBAN</p>
                <p className="font-semibold">{e.iban}</p>
              </div>
            )}
          </div>
          {f.motivo_rectificacion && (
            <p className="text-slate-500">
              Factura rectificativa de la Nº {f.rectificada?.numero} por: {f.motivo_rectificacion}
            </p>
          )}
          {f.notas && <p className="text-slate-500 whitespace-pre-line">{f.notas}</p>}
          {!f.numero && <p className="text-xs text-slate-500">Documento de conformidad previo a la factura. No tiene validez como factura hasta su emisión.</p>}
          {e.pie_factura && <p className="text-[11px] text-slate-400">{e.pie_factura}</p>}
        </footer>
        )}
      </article>
    </div>
  );
}

const Dato = ({ t, v }: { t: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-4">
    <dt className="text-slate-500">{t}</dt>
    <dd className="font-semibold">{v}</dd>
  </div>
);

const Fila = ({ t, v }: { t: string; v: string }) => (
  <div className="flex justify-between gap-4 pl-4">
    <dt className="text-slate-500">{t}</dt>
    <dd className="font-semibold whitespace-nowrap">{v}</dd>
  </div>
);
