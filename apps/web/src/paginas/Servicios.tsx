import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, Cloud, Globe, KeyRound, LifeBuoy, Mail, Pencil, Play, Plus, Receipt, RefreshCw, Server, Trash2, Wrench } from 'lucide-react';
import { importeMensual, nombreTipoServicio, PERIODICIDADES, sumarMeses, mesesPeriodicidad, TIPOS_SERVICIO } from '@stella/shared';
import { api } from '../lib/api';
import { useIvaHabitual } from '../lib/empresa';
import { euros, fecha, fechaCorta, hoyISO } from '../lib/formato';
import {
  AreaTexto, Boton, Buscador, CabeceraDetalle, CabeceraLista, Campo, Cargando, Confirmar, Dato, Entrada, Etiqueta, FilaLista, Filtros,
  Interruptor, ListaDetalle, Panel, Selector, SinSeleccion, Tarjeta, Vacio, cx, useAviso, useFormulario,
} from '../components/ui';

export const IconoServicio = ({ tipo, className }: { tipo: string; className?: string }) => {
  const Icono = { hosting: Server, dominio: Globe, mantenimiento: Wrench, soporte: LifeBuoy, licencia: KeyRound, saas: Cloud, correo: Mail }[tipo] ?? RefreshCw;
  return <Icono className={className} />;
};

const nombrePeriodicidad = (p: string) => PERIODICIDADES.find((x) => x.clave === p)?.nombre.toLowerCase() ?? p;
const en30 = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

/** Etiqueta de la próxima renovación: pasada, pronto o lejos */
function Renovacion({ s }: { s: any }) {
  if (s.estado === 'cancelado') return <Etiqueta>Cancelado</Etiqueta>;
  if (s.proxima_renovacion < hoyISO()) return <Etiqueta color="rojo">Pendiente desde {fechaCorta(s.proxima_renovacion)}</Etiqueta>;
  if (s.proxima_renovacion <= en30()) return <Etiqueta color="naranja">Renueva {fechaCorta(s.proxima_renovacion)}</Etiqueta>;
  return <Etiqueta color="azul">Renueva {fechaCorta(s.proxima_renovacion)}</Etiqueta>;
}

export default function Servicios() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<'activo' | 'cancelado'>('activo');
  const [nuevo, setNuevo] = useState(false);
  // ?facturar=1 abre directamente las renovaciones (lo usan el inicio y los avisos de Telegram)
  const [facturar, setFacturarEstado] = useState(params.get('facturar') === '1');
  const setFacturar = (v: boolean) => { setFacturarEstado(v); if (!v && params.has('facturar')) setParams({}, { replace: true }); };
  const { data: lista, isLoading } = useQuery({
    queryKey: ['servicios', q, estado],
    queryFn: () => api<any[]>(`/servicios?q=${encodeURIComponent(q)}&estado=${estado}`),
  });
  const { data: resumen } = useQuery({ queryKey: ['servicios', 'resumen'], queryFn: () => api('/servicios/resumen') });

  const columna = (
    <>
      <CabeceraLista titulo="Servicios" accion={<Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>Nuevo</Boton>}>
        {resumen && (
          <button onClick={() => setFacturar(true)} className="w-full rounded-2xl bg-marca-50 border border-marca-100 p-3 text-left hover:bg-marca-100/60 transition">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-slate-600">Recurrente al mes</span>
              <span className="text-lg font-bold">{euros(resumen.ingresos_mes)}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Margen {euros(resumen.margen_mes)}/mes · {resumen.renovaciones_30 ? <b className="text-marca-700">{resumen.renovaciones_30} renovaciones en 30 días</b> : 'nada renueva en 30 días'}
            </p>
          </button>
        )}
        <Buscador valor={q} onCambio={setQ} texto="Buscar servicio, dominio o proveedor" />
        <Filtros valor={estado} onCambio={setEstado} opciones={[{ valor: 'activo', texto: 'Activos' }, { valor: 'cancelado', texto: 'Cancelados' }]} />
      </CabeceraLista>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <Cargando /> : !lista?.length ? (
          <Vacio
            icono={<RefreshCw className="size-7" />}
            titulo={q ? 'No hay resultados' : estado === 'cancelado' ? 'No hay servicios cancelados' : 'Aún no hay servicios'}
            texto="Hosting, dominios, mantenimientos y licencias que se cobran cada mes o cada año. Te avisamos antes de cada renovación."
            accion={!q && estado === 'activo' && <Boton onClick={() => setNuevo(true)}>Añadir servicio</Boton>}
          />
        ) : (
          lista.map((s) => (
            <FilaLista key={s.id} activa={s.id === id} onClick={() => navegar(`/servicios/${s.id}`)}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600"><IconoServicio tipo={s.tipo} className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.nombre}</p>
                <p className="truncate text-sm text-slate-500">{s.cliente?.nombre}{s.detalle && ` · ${s.detalle}`}</p>
                <div className="mt-1"><Renovacion s={s} /></div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{euros(s.precio)}</p>
                <p className="text-xs text-slate-500">{nombrePeriodicidad(s.periodicidad)}</p>
              </div>
            </FilaLista>
          ))
        )}
      </div>
    </>
  );

  return (
    <>
      <ListaDetalle hayDetalle={!!id} lista={columna} detalle={id ? <DetalleServicio id={id} /> : <SinSeleccion texto="Elige un servicio para ver sus renovaciones" />} />
      {nuevo && <FormularioServicio onCerrar={() => setNuevo(false)} onCreado={(s) => navegar(`/servicios/${s.id}`)} />}
      {facturar && <FacturarRenovaciones onCerrar={() => setFacturar(false)} />}
    </>
  );
}

function DetalleServicio({ id }: { id: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  const [editar, setEditar] = useState(false);
  const [facturar, setFacturar] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const { data: s, isLoading } = useQuery({ queryKey: ['servicio', id], queryFn: () => api(`/servicios/${id}`) });

  const estado = useMutation({
    mutationFn: (e: 'activo' | 'cancelado') => api(`/servicios/${id}/estado`, { method: 'PATCH', body: { estado: e } }),
    onSuccess: (_r, e) => { qc.invalidateQueries(); avisar(e === 'cancelado' ? 'Servicio cancelado' : 'Servicio activo de nuevo'); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const eliminar = useMutation({
    mutationFn: () => api(`/servicios/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Servicio borrado'); navegar('/servicios'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  if (isLoading || !s) return <Cargando />;
  const margen = Number(s.precio) - Number(s.coste);

  return (
    <div className="min-h-full bg-fondo">
      <CabeceraDetalle
        volver="/servicios"
        titulo={s.nombre}
        subtitulo={<span className="flex items-center gap-2"><Renovacion s={s} /><Link to={`/clientes/${s.cliente.id}`} className="hover:underline truncate">{s.cliente.nombre}</Link></span>}
        acciones={
          <>
            <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditar(true)}>Editar</Boton>
            {s.estado === 'activo'
              ? <Boton variante="secundario" icono={<Ban className="size-4" />} onClick={() => setCancelar(true)}>Cancelar</Boton>
              : <Boton variante="secundario" icono={<Play className="size-4" />} onClick={() => estado.mutate('activo')}>Reactivar</Boton>}
            <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)} aria-label="Borrar" />
          </>
        }
      />
      <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
        {s.estado === 'activo' && (
          <div className={cx('flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border p-4', s.proxima_renovacion <= en30() ? 'bg-amber-50 border-amber-100' : 'bg-marca-50 border-marca-100')}>
            <div className="flex-1">
              <p className="font-semibold">Próxima renovación: {fecha(s.proxima_renovacion)}</p>
              <p className="text-sm text-slate-600">
                Cubre del {fecha(s.proxima_renovacion)} al {fecha(new Date(Date.parse(`${sumarMeses(s.proxima_renovacion, mesesPeriodicidad(s.periodicidad))}T12:00:00Z`) - 864e5).toISOString().slice(0, 10))}
                {!s.renovacion_auto && ' · no se renueva solo: confírmalo con el cliente'}
              </p>
            </div>
            <Boton icono={<Receipt className="size-4" />} onClick={() => setFacturar(true)}>Facturar renovación</Boton>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Cifra texto={`Precio ${nombrePeriodicidad(s.periodicidad)}`} valor={euros(s.precio)} />
          <Cifra texto="Coste" valor={euros(s.coste)} />
          <Cifra texto="Margen" valor={euros(margen)} alerta={margen < 0} />
        </div>

        <Tarjeta titulo="Datos del servicio">
          <dl className="grid sm:grid-cols-2 gap-4">
            <Dato etiqueta="Tipo" valor={nombreTipoServicio(s.tipo)} />
            <Dato etiqueta="Detalle" valor={s.detalle} />
            <Dato etiqueta="Proveedor" valor={s.proveedor} />
            <Dato etiqueta="Se cobra" valor={`${euros(s.precio)} ${nombrePeriodicidad(s.periodicidad)} + IVA ${s.iva_pct} % · ${euros(importeMensual(Number(s.precio), s.periodicidad))}/mes`} />
            <Dato etiqueta="Alta" valor={fecha(s.fecha_inicio)} />
            <Dato etiqueta="Proyecto" valor={s.proyecto && <Link to={`/proyectos/${s.proyecto.id}`} className="text-marca-600">{s.proyecto.nombre}</Link>} />
            {s.cancelado_en && <Dato etiqueta="Cancelado el" valor={fecha(s.cancelado_en)} />}
            {s.notas && <Dato etiqueta="Notas" valor={<span className="whitespace-pre-line">{s.notas}</span>} />}
          </dl>
        </Tarjeta>

        <Tarjeta titulo="Renovaciones facturadas">
          {!s.renovaciones.length ? <p className="text-sm text-slate-500">Aún no se ha facturado ninguna renovación.</p> : (
            <ul className="-my-2 divide-y divide-slate-100">
              {s.renovaciones.map((r: any) => (
                <li key={r.id}>
                  <Link to={r.factura ? `/facturas/${r.factura.id}` : '#'} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Del {fechaCorta(r.desde)} al {fechaCorta(r.hasta)}</p>
                      <p className="text-xs text-slate-500">{r.factura ? (r.factura.numero ? `Factura ${r.factura.numero}` : 'Prefactura') : 'Factura borrada'}</p>
                    </div>
                    {r.factura && <Etiqueta color={r.factura.estado === 'cobrada' ? 'verde' : r.factura.estado === 'anulada' ? 'gris' : 'naranja'}>{r.factura.estado === 'cobrada' ? 'Cobrada' : r.factura.estado === 'anulada' ? 'Anulada' : r.factura.estado === 'borrador' ? 'Prefactura' : 'Por cobrar'}</Etiqueta>}
                    <span className="w-20 text-right text-sm font-semibold">{euros(r.importe)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      {editar && <FormularioServicio servicio={s} onCerrar={() => setEditar(false)} />}
      {facturar && <FacturarRenovaciones soloId={s.id} onCerrar={() => setFacturar(false)} />}
      <Confirmar
        abierto={cancelar}
        titulo="¿Cancelar este servicio?"
        texto="Deja de salir en las renovaciones. Lo ya facturado se queda como está y puedes reactivarlo cuando quieras."
        botonSi="Cancelar servicio"
        onNo={() => setCancelar(false)}
        onSi={() => { setCancelar(false); estado.mutate('cancelado'); }}
      />
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar este servicio?"
        texto="Solo se puede si nunca se ha facturado. Si el cliente lo ha dejado, mejor cancélalo."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(false)}
        onSi={() => { setBorrar(false); eliminar.mutate(); }}
      />
    </div>
  );
}

const Cifra = ({ texto, valor, alerta }: { texto: string; valor: string; alerta?: boolean }) => (
  <div className="rounded-2xl bg-white border border-slate-200/70 p-4">
    <p className="text-sm text-slate-500">{texto}</p>
    <p className={cx('text-xl font-bold mt-1', alerta && 'text-red-600')}>{valor}</p>
  </div>
);

/** Factura las renovaciones que vencen hasta una fecha: una factura por cliente */
function FacturarRenovaciones({ soloId, onCerrar }: { soloId?: string; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  const [hasta, setHasta] = useState(soloId ? '2100-12-31' : en30());
  const [fechaFactura, setFechaFactura] = useState(hoyISO());
  const { data: todos } = useQuery({ queryKey: ['servicios', '', 'activo'], queryFn: () => api<any[]>('/servicios?estado=activo') });
  const pendientes = (todos ?? []).filter((s) => (soloId ? s.id === soloId : s.proxima_renovacion <= hasta));
  const [quitados, setQuitados] = useState<Set<string>>(new Set());
  const elegidos = pendientes.filter((s) => !quitados.has(s.id));
  const clientes = new Set(elegidos.map((s) => s.cliente_id)).size;

  const facturar = useMutation({
    mutationFn: (borrador: boolean) =>
      api<any>('/servicios/facturar', { method: 'POST', body: { hasta, fecha: fechaFactura, borrador, servicios: elegidos.map((s) => s.id) } }),
    onSuccess: (r, borrador) => {
      qc.invalidateQueries();
      if (r.errores.length) avisar(r.errores.join(' · '), true);
      else avisar(`${r.creadas === 1 ? '1 factura' : `${r.creadas} facturas`} ${borrador ? 'preparadas como prefactura' : 'emitidas'}`);
      onCerrar();
      if (r.creadas === 1) navegar(`/facturas/${r.facturas[0].id}`);
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={soloId ? 'Facturar la renovación' : 'Facturar renovaciones'}
      pie={
        <>
          <Boton variante="secundario" onClick={() => facturar.mutate(true)} disabled={!elegidos.length || facturar.isPending}>Solo prefacturas</Boton>
          <Boton icono={<Receipt className="size-4" />} onClick={() => facturar.mutate(false)} cargando={facturar.isPending} disabled={!elegidos.length}>
            Emitir {clientes === 1 ? '1 factura' : `${clientes} facturas`}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Se hace una factura por cliente con una línea por servicio, y la próxima renovación de cada uno avanza un periodo.</p>
        <div className="grid grid-cols-2 gap-4">
          {!soloId && <Campo etiqueta="Renuevan hasta el"><Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Campo>}
          <Campo etiqueta="Fecha de las facturas"><Entrada type="date" value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} /></Campo>
        </div>
        {!todos ? <Cargando /> : !pendientes.length ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No hay renovaciones hasta esa fecha.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {pendientes.map((s) => {
              const marcado = !quitados.has(s.id);
              return (
                <li key={s.id}>
                  <label className="flex items-center gap-3 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--color-marca-600)]"
                      checked={marcado}
                      onChange={() => setQuitados((x) => { const n = new Set(x); if (marcado) n.add(s.id); else n.delete(s.id); return n; })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.nombre}</p>
                      <p className="truncate text-xs text-slate-500">{s.cliente?.nombre} · {fechaCorta(s.proxima_renovacion)}</p>
                    </div>
                    <span className="text-sm font-semibold">{euros(s.precio)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {elegidos.length > 0 && (
          <p className="text-right text-sm text-slate-600">Total sin IVA: <b>{euros(elegidos.reduce((t, s) => t + Number(s.precio), 0))}</b></p>
        )}
      </div>
    </Panel>
  );
}

function FormularioServicio({ servicio, onCerrar, onCreado }: { servicio?: any; onCerrar: () => void; onCreado?: (s: any) => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: clientes } = useQuery({ queryKey: ['clientes', ''], queryFn: () => api<any[]>('/clientes') });
  const { data: proyectos } = useQuery({ queryKey: ['proyectos', ''], queryFn: () => api<any[]>('/proyectos') });
  const { valores, campo, poner } = useFormulario({
    cliente_id: servicio?.cliente_id ?? '',
    proyecto_id: servicio?.proyecto_id ?? '',
    tipo: servicio?.tipo ?? 'hosting',
    nombre: servicio?.nombre ?? '',
    detalle: servicio?.detalle ?? '',
    proveedor: servicio?.proveedor ?? '',
    precio: servicio?.precio ?? '',
    coste: servicio?.coste ?? '',
    periodicidad: servicio?.periodicidad ?? 'mensual',
    iva_pct: servicio?.iva_pct ?? 0,
    fecha_inicio: servicio?.fecha_inicio ?? hoyISO(),
    proxima_renovacion: servicio?.proxima_renovacion ?? hoyISO(),
    renovacion_auto: servicio?.renovacion_auto ?? true,
    notas: servicio?.notas ?? '',
  });
  useIvaHabitual(!servicio, (iva) => poner('iva_pct', iva));
  const proyectosCliente = (proyectos ?? []).filter((p) => p.cliente_id === valores.cliente_id);
  const guardar = useMutation({
    mutationFn: () => (servicio ? api(`/servicios/${servicio.id}`, { method: 'PATCH', body: valores }) : api('/servicios', { method: 'POST', body: valores })),
    onSuccess: (r) => { qc.invalidateQueries(); avisar(servicio ? 'Servicio guardado' : 'Servicio creado'); onCerrar(); onCreado?.(r); },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={servicio ? 'Editar servicio' : 'Nuevo servicio'}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
    >
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Cliente">
            <Selector value={valores.cliente_id} onChange={(e) => { poner('cliente_id', e.target.value); poner('proyecto_id', ''); }}>
              <option value="">Elige un cliente…</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Tipo">
            <Selector {...campo('tipo')}>
              {TIPOS_SERVICIO.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Nombre" className="sm:col-span-2"><Entrada {...campo('nombre')} placeholder="Hosting web corporativa" /></Campo>
          <Campo etiqueta="Detalle" ayuda="Dominio, plan, servidor…"><Entrada {...campo('detalle')} placeholder="cafeorigen.es" /></Campo>
          <Campo etiqueta="Proveedor" ayuda="A quién se lo compramos"><Entrada {...campo('proveedor')} placeholder="Hetzner, OVH, Google…" /></Campo>
        </div>

        <div className="rounded-2xl bg-marca-50/60 border border-marca-100 p-4 space-y-4">
          <p className="font-semibold text-slate-800">¿Cuánto y cada cuánto?</p>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Se cobra"><Selector {...campo('periodicidad')}>{PERIODICIDADES.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}</Selector></Campo>
            <Campo etiqueta="IVA %"><Entrada type="number" inputMode="decimal" {...campo('iva_pct')} /></Campo>
            <Campo etiqueta="Precio al cliente €"><Entrada type="number" inputMode="decimal" step="0.01" {...campo('precio')} /></Campo>
            <Campo etiqueta="Nos cuesta €"><Entrada type="number" inputMode="decimal" step="0.01" {...campo('coste')} /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Alta"><Entrada type="date" {...campo('fecha_inicio')} /></Campo>
            <Campo etiqueta="Próxima renovación"><Entrada type="date" {...campo('proxima_renovacion')} /></Campo>
          </div>
          <Interruptor
            activo={valores.renovacion_auto}
            onChange={(x) => poner('renovacion_auto', x)}
            etiqueta="Se renueva solo"
            ayuda="Si no, te lo recordamos para que lo confirmes con el cliente antes de renovar"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Proyecto (opcional)">
            <Selector {...campo('proyecto_id')} disabled={!valores.cliente_id}>
              <option value="">Sin proyecto</option>
              {proyectosCliente.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Notas" className="sm:col-span-2"><AreaTexto {...campo('notas')} /></Campo>
        </div>
      </div>
    </Panel>
  );
}
