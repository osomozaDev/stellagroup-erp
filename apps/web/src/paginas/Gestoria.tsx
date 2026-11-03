import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Info } from 'lucide-react';
import { api, descargar } from '../lib/api';
import { euros, num } from '../lib/formato';
import { Boton, Cargando, Etiqueta, Filtros, Tarjeta, useAviso } from '../components/ui';

const trimestreActual = () => Math.floor(new Date().getMonth() / 3) + 1;

export default function Gestoria() {
  const avisar = useAviso();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [trimestre, setTrimestre] = useState<'1' | '2' | '3' | '4'>(String(trimestreActual()) as '1');
  const [bajando, setBajando] = useState('');

  const { data: r, isLoading } = useQuery({
    queryKey: ['gestoria', anio, trimestre],
    queryFn: () => api(`/gestoria/resumen?anio=${anio}&trimestre=${trimestre}`),
  });
  const { data: m347 } = useQuery({ queryKey: ['347', anio], queryFn: () => api(`/gestoria/347?anio=${anio}`) });

  const bajar = async (clave: string, ruta: string, nombre: string) => {
    setBajando(clave);
    try {
      await descargar(ruta, nombre);
    } catch (e: any) {
      avisar(e.message, true);
    } finally {
      setBajando('');
    }
  };

  const declarables = m347?.clientes.filter((c: any) => c.declarar) ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestoría</h1>
            <p className="text-slate-500 mt-1">Todo lo que tu gestoría te pide cada trimestre, listo para enviar.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setAnio(anio - 1)} className="rounded-full bg-slate-100 p-2.5 hover:bg-slate-200" aria-label="Año anterior"><ChevronLeft className="size-4" /></button>
            <span className="w-14 text-center font-semibold">{anio}</span>
            <button onClick={() => setAnio(anio + 1)} className="rounded-full bg-slate-100 p-2.5 hover:bg-slate-200" aria-label="Año siguiente"><ChevronRight className="size-4" /></button>
          </div>
        </div>

        <Filtros
          valor={trimestre}
          onCambio={setTrimestre}
          opciones={[
            { valor: '1', texto: '1er trimestre · ene–mar' },
            { valor: '2', texto: '2º · abr–jun' },
            { valor: '3', texto: '3er · jul–sep' },
            { valor: '4', texto: '4º · oct–dic' },
          ]}
        />

        {isLoading || !r ? <Cargando /> : (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <Tarjeta titulo="Facturas emitidas">
                <p className="text-xs text-slate-500 -mt-1 mb-3">Para el IVA (modelo 303)</p>
                <dl className="space-y-2 text-sm">
                  <Fila t="Facturas" v={num(r.facturas.numero)} />
                  <Fila t="Base imponible total" v={euros(r.facturas.base_total)} />
                  {r.facturas.iva_por_tipo.map((t: any) => (
                    <Fila key={t.tipo} t={`IVA al ${num(t.tipo)} % (sobre ${euros(t.base)})`} v={euros(t.cuota)} />
                  ))}
                  <Fila t="IVA repercutido" v={euros(r.facturas.iva_total)} fuerte />
                  {r.facturas.retenciones_irpf > 0 && <Fila t="Retenciones de IRPF" v={euros(r.facturas.retenciones_irpf)} />}
                </dl>
              </Tarjeta>
              <Tarjeta titulo="Nóminas">
                <p className="text-xs text-slate-500 -mt-1 mb-3">Para el IRPF (modelo 111) y la Seguridad Social</p>
                <dl className="space-y-2 text-sm">
                  <Fila t="Personas" v={num(r.nominas.perceptores)} />
                  <Fila t="Salario bruto" v={euros(r.nominas.bruto)} />
                  <Fila t="IRPF retenido" v={euros(r.nominas.irpf)} fuerte />
                  <Fila t="Seg. Social trabajador" v={euros(r.nominas.ss_trabajador)} />
                  <Fila t="Seg. Social empresa" v={euros(r.nominas.ss_empresa)} />
                  <Fila t="Coste total de personal" v={euros(r.nominas.coste_empresa)} />
                </dl>
              </Tarjeta>
            </div>

            <div className="rounded-2xl bg-marca-50 border border-marca-100 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold">Excel del {trimestre}º trimestre de {anio}</p>
                <p className="text-sm text-slate-600">Resumen, facturas emitidas y nóminas, en tres hojas.</p>
              </div>
              <Boton
                className="h-12"
                icono={<Download className="size-4" />}
                cargando={bajando === 'trimestre'}
                onClick={() => bajar('trimestre', `/gestoria/excel?anio=${anio}&trimestre=${trimestre}`, `Gestoria ${trimestre}T ${anio}.xlsx`)}
              >
                Descargar Excel
              </Boton>
            </div>
          </>
        )}

        <Tarjeta
          titulo={`Modelo 347 · ${anio}`}
          accion={
            <Boton variante="secundario" icono={<Download className="size-4" />} cargando={bajando === '347'} onClick={() => bajar('347', `/gestoria/347/excel?anio=${anio}`, `Modelo 347 ${anio}.xlsx`)}>
              Excel
            </Boton>
          }
        >
          <p className="text-sm text-slate-500 -mt-1 mb-4">
            Clientes con los que has facturado más de {euros(m347?.umbral ?? 3005.06)} en el año, IVA incluido. Se presenta en febrero.
          </p>
          {!m347 ? <Cargando /> : m347.clientes.length === 0 ? (
            <p className="text-sm text-slate-500">No hay facturas en {anio}.</p>
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {m347.clientes.map((c: any) => (
                <li key={`${c.clave}${c.nif ?? c.nombre}`} className="py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.nombre}</p>
                    <p className="text-xs text-slate-500">
                      {c.tipo} · {c.nif ?? 'Sin NIF'} · 1T {euros(c.t1)} · 2T {euros(c.t2)} · 3T {euros(c.t3)} · 4T {euros(c.t4)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{euros(c.total)}</p>
                    <Etiqueta color={c.declarar ? 'azul' : 'gris'}>{c.declarar ? 'Se declara' : 'No llega'}</Etiqueta>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {declarables.some((c: any) => !c.nif) && (
            <p className="mt-3 text-sm text-red-600">Hay clientes sin NIF: complétalo en su ficha antes de presentar el 347.</p>
          )}
        </Tarjeta>

        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <Info className="size-4 mt-0.5 shrink-0" />
          <p>
            Las facturas en borrador no cuentan y las anuladas salen en el libro pero no suman. Las nóminas son las estimadas en Stella ERP:
            la gestoría debe cuadrarlas con las oficiales. Los gastos (hosting, licencias, alquileres…) y su IVA soportado los añade la gestoría.
          </p>
        </div>
      </div>
    </div>
  );
}

const Fila = ({ t, v, fuerte, ayuda }: { t: string; v: string; fuerte?: boolean; ayuda?: string }) => (
  <div className={`flex justify-between gap-4 ${fuerte ? 'font-semibold border-t border-slate-100 pt-2' : ''}`}>
    <dt className={fuerte ? '' : 'text-slate-600'}>
      {t}
      {ayuda && <span className="block text-xs text-slate-400 font-normal">{ayuda}</span>}
    </dt>
    <dd className="whitespace-nowrap font-medium">{v}</dd>
  </div>
);
