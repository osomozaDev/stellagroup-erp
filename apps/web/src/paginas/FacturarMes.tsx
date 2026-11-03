import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FolderKanban, Check, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { calcularTotales } from '@stella/shared';
import { api } from '../lib/api';
import { euros, finDeMes, mesActual, moverMes, nombreMes, num } from '../lib/formato';
import { AreaTexto, Boton, Campo, Cargando, Entrada, Etiqueta, Vacio, cx, useAviso } from '../components/ui';

export default function FacturarMes() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [mes, setMes] = useState(mesActual());
  const [fechaFactura, setFechaFactura] = useState(finDeMes(mesActual()));
  const [horas, setHoras] = useState<Record<string, string>>({});
  const [conceptos, setConceptos] = useState<Record<string, string>>({});
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({});
  const [resultado, setResultado] = useState<{ creadas: number; errores: string[] } | null>(null);

  const { data: proyectos, isLoading } = useQuery({
    queryKey: ['pendientes-mes', mes],
    queryFn: () => api<any[]>(`/facturas/pendientes-mes?periodo=${mes}`),
  });

  // Cada vez que cambia el mes, se proponen las horas habituales de cada proyecto
  useEffect(() => {
    if (!proyectos) return;
    setHoras(Object.fromEntries(proyectos.map((o) => [o.id, String(Number(o.horas_mes))])));
    setConceptos(Object.fromEntries(proyectos.map((o) => [o.id, o.concepto ?? ''])));
    setMarcadas(Object.fromEntries(proyectos.map((o) => [o.id, !o.factura_id])));
  }, [proyectos]);

  const cambiarMes = (delta: number) => {
    const nuevo = moverMes(mes, delta);
    setMes(nuevo);
    setFechaFactura(finDeMes(nuevo));
  };

  const pendientes = (proyectos ?? []).filter((o) => !o.factura_id);
  const elegidas = pendientes.filter((o) => marcadas[o.id]);
  const totalProyecto = (o: any) =>
    calcularTotales([{ cantidad: Number(horas[o.id]) || 0, precio: Number(o.precio_hora) }], Number(o.iva_pct), Number(o.retencion_pct));
  const totalGeneral = elegidas.reduce((s, o) => s + totalProyecto(o).total, 0);

  const crear = useMutation({
    mutationFn: () =>
      api('/facturas/facturar-mes', {
        method: 'POST',
        body: { periodo: mes, fecha: fechaFactura, proyectos: elegidas.map((o) => ({ proyecto_id: o.id, horas: Number(horas[o.id]) || 0, concepto: conceptos[o.id]?.trim() || undefined })) },
      }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      setResultado(r);
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  if (resultado) {
    return (
      <div className="h-full overflow-y-auto flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="size-9" />
          </div>
          <h1 className="text-2xl font-bold">¡Hecho!</h1>
          <p className="mt-2 text-slate-600">
            {resultado.creadas === 1 ? 'Se ha creado 1 factura' : `Se han creado ${resultado.creadas} facturas`} de {nombreMes(`${mes}-01`)}.
          </p>
          {resultado.errores.length > 0 && (
            <div className="mt-4 rounded-xl bg-red-50 p-3 text-left text-sm text-red-700">
              {resultado.errores.map((e) => <p key={e}>{e}</p>)}
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <Boton onClick={() => navegar('/facturas?estado=emitida')}>Ver las facturas</Boton>
            <Boton variante="fantasma" onClick={() => navegar('/')}>Volver al inicio</Boton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-2 md:px-6 h-16 border-b border-slate-100 shrink-0">
        <button onClick={() => navegar(-1)} className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Volver">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg md:text-xl font-semibold">Facturar el mes</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
          <div className="rounded-2xl bg-marca-50 p-4 md:p-5 space-y-4">
            <p className="text-sm text-marca-700 font-medium">1. Elige el mes</p>
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => cambiarMes(-1)} className="rounded-full bg-white p-3 shadow-sm hover:bg-slate-50" aria-label="Mes anterior">
                <ChevronLeft className="size-5" />
              </button>
              <p className="text-xl md:text-2xl font-bold capitalize">{nombreMes(`${mes}-01`)}</p>
              <button onClick={() => cambiarMes(1)} className="rounded-full bg-white p-3 shadow-sm hover:bg-slate-50" aria-label="Mes siguiente">
                <ChevronRight className="size-5" />
              </button>
            </div>
            <Campo etiqueta="Fecha que llevarán las facturas">
              <Entrada type="date" value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} />
            </Campo>
          </div>

          <div>
            <p className="text-sm text-slate-600 font-medium mb-3">2. Revisa el detalle y las horas de cada proyecto por horas</p>
            {isLoading ? <Cargando /> : !proyectos?.length ? (
              <Vacio
                icono={<FolderKanban className="size-7" />}
                titulo="No hay proyectos por horas en marcha"
                texto="Aquí salen los proyectos que se facturan por horas cada mes. Los proyectos por hitos se facturan desde su ficha."
                accion={<Link to="/proyectos"><Boton>Ir a Proyectos</Boton></Link>}
              />
            ) : (
              <ul className="space-y-3">
                {proyectos.map((o) => {
                  const hecha = !!o.factura_id;
                  const activa = !hecha && marcadas[o.id];
                  const t = totalProyecto(o);
                  return (
                    <li key={o.id} className={cx('rounded-2xl border p-4 transition', hecha ? 'bg-slate-50 border-slate-200' : activa ? 'bg-white border-marca-200 shadow-sm' : 'bg-white border-slate-200 opacity-70')}>
                      <div className="flex items-start gap-3">
                        <button
                          disabled={hecha}
                          onClick={() => setMarcadas((m) => ({ ...m, [o.id]: !m[o.id] }))}
                          className={cx('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border-2 transition', activa ? 'bg-marca-600 border-marca-600 text-white' : 'border-slate-300 bg-white', hecha && 'opacity-40')}
                          aria-label={activa ? 'No facturar este proyecto' : 'Facturar este proyecto'}
                        >
                          {(activa || hecha) && <Check className="size-4" strokeWidth={3} />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{o.nombre}</p>
                          <p className="text-sm text-slate-500 truncate">
                            {o.cliente?.nombre}
                            {o.prefactura_id && !hecha && <span className="ml-2 align-middle"><Etiqueta color="azul">Prefactura</Etiqueta></span>}
                          </p>
                          {hecha ? (
                            <Link to={`/facturas/${o.factura_id}`} className="mt-2 inline-block">
                              <Etiqueta color="verde">Ya facturada · {o.factura_numero}</Etiqueta>
                            </Link>
                          ) : (
                            <>
                            <label className="mt-3 block">
                              <span className="block text-xs text-slate-500 mb-1">
                                Detalle de la factura
                                {o.concepto_origen === 'mes_anterior' && o.concepto_mes_anterior && ` · copiado de ${nombreMes(o.concepto_mes_anterior)}, cambia lo que sea distinto`}
                                {o.concepto_origen === 'prefactura' && ' · el de la prefactura'}
                              </span>
                              <AreaTexto
                                rows={Math.min(Math.max((conceptos[o.id] ?? '').split('\n').length, 2), 6)}
                                value={conceptos[o.id]}
                                disabled={!activa}
                                onChange={(e) => setConceptos((c) => ({ ...c, [o.id]: e.target.value }))}
                              />
                            </label>
                            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
                              <label className="w-28">
                                <span className="block text-xs text-slate-500 mb-1">Horas</span>
                                <Entrada type="number" inputMode="decimal" step="0.5" value={horas[o.id]} disabled={!activa} onChange={(e) => setHoras((h) => ({ ...h, [o.id]: e.target.value }))} />
                              </label>
                              <div className="text-sm text-slate-500 pb-2.5">× {euros(o.precio_hora)}/h</div>
                              <div className="ml-auto text-right pb-1.5">
                                <p className="text-lg font-bold">{euros(t.total)}</p>
                                <p className="text-xs text-slate-500">
                                  {`con IVA ${num(o.iva_pct)} %`}
                                  {Number(o.retencion_pct) > 0 && ` · ret. ${num(o.retencion_pct)} %`}
                                </p>
                              </div>
                            </div>
                            {o.horas_origen === 'registro' && (
                              <p className={cx('mt-1.5 text-xs', o.horas_semanas < o.semanas_mes ? 'text-amber-700' : 'text-slate-500')}>
                                Suma de las horas por semana · {o.horas_semanas} de {o.semanas_mes} semanas apuntadas
                              </p>
                            )}
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {pendientes.length > 0 && (
        <div className="border-t border-slate-100 bg-white px-4 md:px-6 py-3 pb-seguro shrink-0">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-slate-500">{elegidas.length} de {pendientes.length} proyectos</p>
              <p className="text-lg font-bold">{euros(totalGeneral)}</p>
            </div>
            <Boton className="h-12 px-6" disabled={!elegidas.length} cargando={crear.isPending} onClick={() => crear.mutate()}>
              {elegidas.length === 1 ? 'Emitir 1 factura' : `Emitir ${elegidas.length} facturas`}
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}
