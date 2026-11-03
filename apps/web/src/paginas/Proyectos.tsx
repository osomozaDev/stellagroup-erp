import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CalendarRange, CheckCircle2, Code2, ExternalLink, FilePlus2, FolderKanban, Gauge, Globe, Pause, Pencil, Play, Plug, Plus, RefreshCw, ShoppingCart, Smartphone,
  Sparkles, Trash2, UserRound, Workflow,
} from 'lucide-react';
import { calcularTotales, EstadoProyecto, nombreTipoProyecto, nombreTipoServicio, TIPOS_PROYECTO } from '@stella/shared';
import { api } from '../lib/api';
import { useIvaHabitual } from '../lib/empresa';
import { euros, fecha, fechaCorta, nombreCompleto, nombreMes, num } from '../lib/formato';
import {
  AreaTexto, Boton, Buscador, CabeceraDetalle, CabeceraLista, Campo, Cargando, ColorEtiqueta, Confirmar, Dato, Entrada, Etiqueta,
  FilaLista, Filtros, ListaDetalle, Panel, Selector, SinSeleccion, Tarjeta, Vacio, cx, useAviso, useFormulario,
} from '../components/ui';
import { estadoFactura, FormularioFactura } from './Facturas';
import HorasSemanales from '../components/HorasSemanales';
import Hitos from '../components/Hitos';

/** Horas que salen de una base a un precio por hora: «669 h» */
const horas = (base: number, precio: number | string) => (Number(precio) > 0 ? `${num(Math.round((base / Number(precio)) * 10) / 10)} h` : '—');

/** Número de meses que dura el proyecto (contando el primero y el último), o 0 si faltan fechas */
const mesesProyecto = (inicio?: string | null, fin?: string | null) => {
  if (!inicio || !fin || fin < inicio) return 0;
  const [a1, m1] = inicio.split('-').map(Number);
  const [a2, m2] = fin.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
};

/** Franja con el estado del proyecto y los botones para cambiarlo, siempre a la vista */
function EstadoDelProyecto({ estado, porHoras, cargando, onCambiar }: { estado: EstadoProyecto; porHoras: boolean; cargando: boolean; onCambiar: (e: EstadoProyecto) => void }) {
  const info = {
    activo: { texto: 'Proyecto en marcha', detalle: porHoras ? 'Se factura cada mes por las horas trabajadas.' : 'Se factura según se entregan los hitos.', fondo: 'bg-marca-50 border-marca-100' },
    pausado: { texto: 'Proyecto pausado', detalle: 'No sale en «Facturar el mes» hasta que lo reactives.', fondo: 'bg-amber-50 border-amber-100' },
    terminado: { texto: 'Proyecto terminado', detalle: 'Ya no se factura. Sus facturas se conservan.', fondo: 'bg-slate-100 border-slate-200' },
  }[estado];
  return (
    <div className={cx('flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border p-4', info.fondo)}>
      <div className="flex-1">
        <p className="font-semibold">{info.texto}</p>
        <p className="text-sm text-slate-600">{info.detalle}</p>
      </div>
      <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
        {estado !== 'activo' && (
          <Boton variante="secundario" icono={<Play className="size-4" />} onClick={() => onCambiar('activo')} disabled={cargando}>Reactivar</Boton>
        )}
        {estado === 'activo' && (
          <Boton variante="secundario" icono={<Pause className="size-4" />} onClick={() => onCambiar('pausado')} disabled={cargando}>Pausar</Boton>
        )}
        {estado !== 'terminado' && (
          <Boton variante="secundario" icono={<CheckCircle2 className="size-4" />} onClick={() => onCambiar('terminado')} disabled={cargando}>Terminar proyecto</Boton>
        )}
      </div>
    </div>
  );
}

export const estadoProyecto = (e: EstadoProyecto): { texto: string; color: ColorEtiqueta } =>
  ({ activo: { texto: 'En marcha', color: 'azul' }, pausado: { texto: 'Pausado', color: 'naranja' }, terminado: { texto: 'Terminado', color: 'gris' } })[e] as any;

/** Icono de cada tipo de proyecto */
export const IconoTipo = ({ tipo, className }: { tipo: string; className?: string }) => {
  const Icono = { web: Globe, ecommerce: ShoppingCart, software: Code2, app: Smartphone, automatizacion: Workflow, integracion: Plug, ia: Sparkles, seo: Gauge }[tipo] ?? FolderKanban;
  return <Icono className={className} />;
};

export default function Proyectos() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<'' | EstadoProyecto>('activo');
  const [params, setParams] = useSearchParams();
  // ?nuevo=1 abre el formulario directamente (lo usa la guía de primeros pasos)
  const [nuevo, setNuevoEstado] = useState(params.get('nuevo') === '1');
  const setNuevo = (v: boolean) => { setNuevoEstado(v); if (!v && params.has('nuevo')) setParams({}, { replace: true }); };
  const { data: proyectos, isLoading } = useQuery({
    queryKey: ['proyectos', q, estado],
    queryFn: () => api<any[]>(`/proyectos?q=${encodeURIComponent(q)}${estado ? `&estado=${estado}` : ''}`),
  });

  const lista = (
    <>
      <CabeceraLista titulo="Proyectos" accion={<Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>Nuevo</Boton>}>
        <Buscador valor={q} onCambio={setQ} texto="Buscar proyecto o referencia" />
        <Filtros
          valor={estado}
          onCambio={setEstado}
          opciones={[
            { valor: 'activo', texto: 'En marcha' },
            { valor: 'pausado', texto: 'Pausados' },
            { valor: 'terminado', texto: 'Terminados' },
            { valor: '', texto: 'Todos' },
          ]}
        />
      </CabeceraLista>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <Cargando /> : !proyectos?.length ? (
          <Vacio icono={<FolderKanban className="size-7" />} titulo="No hay proyectos" texto="Un proyecto es una web, una app o un desarrollo para un cliente. Se factura por hitos o por horas." accion={<Boton onClick={() => setNuevo(true)}>Crear proyecto</Boton>} />
        ) : (
          proyectos.map((o) => {
            const mensual = calcularTotales([{ cantidad: Number(o.horas_mes), precio: Number(o.precio_hora) }], 0, 0).base;
            return (
              <FilaLista key={o.id} activa={o.id === id} onClick={() => navegar(`/proyectos/${o.id}`)}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600"><IconoTipo tipo={o.tipo} className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{o.nombre}</p>
                  <p className="truncate text-sm text-slate-500">{o.cliente?.nombre} · {nombreTipoProyecto(o.tipo)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {o.modalidad === 'hitos' ? (
                      <>
                        {o.hitos_total ? `${o.hitos_completados} de ${o.hitos_total} hitos entregados` : 'Sin hitos'} · <b className="text-slate-700">{euros(o.presupuesto)}</b>
                      </>
                    ) : o.ultimo_base !== null ? (
                      <>
                        {nombreMes(o.ultimo_periodo)}: {horas(o.ultimo_base, o.precio_hora)} = <b className="text-slate-700">{euros(o.ultimo_base)}</b>
                        {o.media_base !== null && o.media_base !== o.ultimo_base && <> · media {euros(o.media_base)}/mes</>}
                      </>
                    ) : (
                      <>Por horas: {num(o.horas_mes)} h × {euros(o.precio_hora)} = <b className="text-slate-700">{euros(mensual)}/mes</b></>
                    )}
                  </p>
                </div>
                {!estado && <Etiqueta color={estadoProyecto(o.estado).color}>{estadoProyecto(o.estado).texto}</Etiqueta>}
              </FilaLista>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <>
      <ListaDetalle hayDetalle={!!id} lista={lista} detalle={id ? <DetalleProyecto id={id} /> : <SinSeleccion texto="Elige un proyecto para ver su detalle" />} />
      {nuevo && <FormularioProyecto onCerrar={() => setNuevo(false)} onCreada={(o) => navegar(`/proyectos/${o.id}`)} />}
    </>
  );
}

function DetalleProyecto({ id }: { id: string }) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [editar, setEditar] = useState(false);
  const [facturar, setFacturar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [rehacer, setRehacer] = useState(false);
  const [terminar, setTerminar] = useState(false);
  const { data: o, isLoading } = useQuery({ queryKey: ['proyecto', id], queryFn: () => api(`/proyectos/${id}`) });

  const prefacturas = useMutation({
    mutationFn: (actualizar: boolean) => api(`/proyectos/${id}/prefacturas`, { method: 'POST', body: { actualizar } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      avisar(
        r.actualizadas
          ? `${r.actualizadas} prefacturas actualizadas${r.creadas ? ` y ${r.creadas} nuevas` : ''}`
          : r.creadas ? `${r.creadas} prefacturas creadas` : 'Ya estaban todas hechas',
      );
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  const eliminar = useMutation({
    mutationFn: () => api(`/proyectos/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Proyecto borrado'); navegar('/proyectos'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  const cambiarEstado = useMutation({
    mutationFn: (v: { estado: EstadoProyecto; borrarPrefacturas?: boolean }) => api(`/proyectos/${id}/estado`, { method: 'PATCH', body: v }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries();
      avisar({ activo: 'Proyecto en marcha de nuevo', pausado: 'Proyecto pausado', terminado: 'Proyecto terminado' }[v.estado]);
    },
    onError: (err: Error) => avisar(err.message, true),
  });

  if (isLoading || !o) return <Cargando />;
  const porHoras = o.modalidad === 'horas';
  const t = calcularTotales([{ cantidad: Number(o.horas_mes), precio: Number(o.precio_hora) }], Number(o.iva_pct), Number(o.retencion_pct));
  const validas = o.facturas.filter((f: any) => f.estado === 'emitida' || f.estado === 'cobrada');
  const borradores = o.facturas.filter((f: any) => f.estado === 'borrador');
  const meses = mesesProyecto(o.fecha_inicio, o.fecha_fin);
  const conFactura = new Set(o.facturas.filter((f: any) => f.estado !== 'anulada' && f.periodo).map((f: any) => f.periodo)).size;
  const facturasOrdenadas = [...o.facturas].sort((a: any, b: any) => (b.periodo ?? b.fecha).localeCompare(a.periodo ?? a.fecha));
  const facturado = validas.reduce((s: number, f: any) => s + Number(f.base), 0);
  const cobrado = validas.filter((f: any) => f.estado === 'cobrada').reduce((s: number, f: any) => s + Number(f.total), 0);
  const e = estadoProyecto(o.estado);
  // Lo real de cada mes (las horas cambian), no la previsión de la ficha
  const mensuales = validas.filter((f: any) => f.periodo && !f.rectifica_id).sort((a: any, b: any) => a.periodo.localeCompare(b.periodo));
  const ultimaMensual = mensuales.at(-1);
  const mediaBase = mensuales.reduce((s: number, f: any) => s + Number(f.base), 0) / (mensuales.length || 1);
  const presupuesto = Number(o.presupuesto);

  return (
    <div className="min-h-full bg-fondo">
      <CabeceraDetalle
        volver="/proyectos"
        titulo={o.nombre}
        subtitulo={<span className="flex items-center gap-2"><Etiqueta color={e.color}>{e.texto}</Etiqueta><Link to={`/clientes/${o.cliente.id}`} className="hover:underline truncate">{o.cliente.nombre}</Link></span>}
        acciones={
          <>
            <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditar(true)}>Editar</Boton>
            <Boton variante="secundario" icono={<FilePlus2 className="size-4" />} onClick={() => setFacturar(true)}>Factura suelta</Boton>
            <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)} aria-label="Borrar" />
          </>
        }
      />
      <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
        <EstadoDelProyecto
          estado={o.estado}
          porHoras={porHoras}
          cargando={cambiarEstado.isPending}
          onCambiar={(estado) => (estado === 'terminado' ? setTerminar(true) : cambiarEstado.mutate({ estado }))}
        />

        {porHoras ? (
          <div className="rounded-2xl bg-white border border-slate-200/70 p-4 md:p-5">
            {ultimaMensual ? (
              <>
                <p className="text-sm text-slate-500">Último mes facturado · <span className="capitalize">{nombreMes(ultimaMensual.periodo)}</span></p>
                <p className="text-2xl md:text-3xl font-bold tracking-tight mt-1">{euros(Number(ultimaMensual.total))}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {horas(Number(ultimaMensual.base), o.precio_hora)} = {euros(Number(ultimaMensual.base))} de base
                  {mensuales.length > 1 && ` · media de ${mensuales.length} meses: ${euros(mediaBase)} de base (${horas(mediaBase, o.precio_hora)})`}
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Para las prefacturas se usan {num(o.horas_mes)} h × {euros(o.precio_hora)}; las horas reales se cambian cada mes al facturar.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">Previsto cada mes</p>
                <p className="text-2xl md:text-3xl font-bold tracking-tight mt-1">{euros(t.total)}</p>
                <p className="text-sm text-slate-500 mt-1">
                  {num(o.horas_mes)} horas × {euros(o.precio_hora)} = {euros(t.base)} de base + IVA {num(o.iva_pct)} %
                  {Number(o.retencion_pct) > 0 && ` − IRPF ${num(o.retencion_pct)} %`}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200/70 p-4 md:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Presupuesto del proyecto</p>
                <p className="text-2xl md:text-3xl font-bold tracking-tight mt-1">{euros(presupuesto)}</p>
              </div>
              <p className="text-sm text-slate-500 text-right">Facturado <b className="text-slate-900">{euros(facturado)}</b><br />sin IVA</p>
            </div>
            {presupuesto > 0 && (
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-marca-600" style={{ width: `${Math.min(100, (facturado / presupuesto) * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white border border-slate-200/70 p-4">
            <p className="text-sm text-slate-500">Facturado (sin IVA)</p>
            <p className="text-xl font-bold mt-1">{euros(facturado)}</p>
          </div>
          <div className="rounded-2xl bg-white border border-slate-200/70 p-4">
            <p className="text-sm text-slate-500">Cobrado</p>
            <p className="text-xl font-bold mt-1">{euros(cobrado)}</p>
          </div>
        </div>

        {!porHoras && <Hitos proyecto={o} />}

        {porHoras && <HorasSemanales proyecto={o} />}

        {porHoras && (
          <Tarjeta titulo="Prefacturas de todo el proyecto">
            {!meses ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <CalendarRange className="size-8 text-marca-500 shrink-0" />
                <p className="flex-1 text-sm text-slate-600">
                  Pon la <b>fecha de inicio y de fin</b> del proyecto y te preparo de una vez las prefacturas de todos los meses.
                  Cada mes solo tendrás que revisar las horas y emitirla.
                </p>
                <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditar(true)}>Poner fechas</Boton>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-slate-600">
                      <b className="text-slate-900">{validas.length}</b> {validas.length === 1 ? 'emitida' : 'emitidas'} · <b className="text-slate-900">{borradores.length}</b> {borradores.length === 1 ? 'prefactura' : 'prefacturas'} · {meses} meses
                    </span>
                    <span className="text-slate-500">Falta por facturar <b className="text-slate-900">{euros(borradores.reduce((x: number, f: any) => x + Number(f.total), 0))}</b></span>
                  </div>
                  <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-marca-600" style={{ width: `${(validas.length / meses) * 100}%` }} />
                    <div className="bg-marca-200" style={{ width: `${(borradores.length / meses) * 100}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {conFactura < meses && (
                    <Boton icono={<CalendarRange className="size-4" />} onClick={() => prefacturas.mutate(false)} cargando={prefacturas.isPending}>
                      Generar {meses - conFactura === 1 ? '1 prefactura' : `${meses - conFactura} prefacturas`}
                    </Boton>
                  )}
                  {borradores.length > 0 && (
                    <Boton variante="secundario" icono={<RefreshCw className="size-4" />} onClick={() => setRehacer(true)}>Actualizar prefacturas</Boton>
                  )}
                </div>
              </div>
            )}
          </Tarjeta>
        )}

        <Tarjeta titulo="Datos del proyecto">
          <dl className="grid sm:grid-cols-2 gap-4">
            <Dato etiqueta="Tipo" valor={nombreTipoProyecto(o.tipo)} />
            <Dato etiqueta="Se factura" valor={porHoras ? `Por horas · ${euros(o.precio_hora)}/h` : 'Por hitos'} />
            <Dato etiqueta="Referencia" valor={o.referencia} />
            <Dato etiqueta="Fechas" valor={`${fecha(o.fecha_inicio)} → ${o.fecha_fin ? fecha(o.fecha_fin) : 'en curso'}`} />
            {o.url && <Dato etiqueta="Enlace" valor={<a href={o.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-marca-600 hover:underline break-all">{o.url.replace(/^https?:\/\//, '')}<ExternalLink className="size-3.5 shrink-0" /></a>} />}
            <Dato etiqueta="Concepto en la factura" valor={<span className="whitespace-pre-line">{o.concepto}</span>} />
            {o.descripcion && <Dato etiqueta="Descripción" valor={<span className="whitespace-pre-line">{o.descripcion}</span>} />}
            {o.notas && <Dato etiqueta="Notas" valor={o.notas} />}
          </dl>
        </Tarjeta>

        <Tarjeta titulo="Facturas de este proyecto">
          {o.facturas.length === 0 ? <p className="text-sm text-slate-500">Aún no se ha facturado.</p> : (
            <ul className="-my-2 divide-y divide-slate-100">
              {facturasOrdenadas.map((f: any) => {
                const ef = estadoFactura(f);
                return (
                  <li key={f.id}>
                    <Link to={`/facturas/${f.id}`} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium first-letter:uppercase">{f.periodo ? nombreMes(f.periodo) : f.numero ?? 'Prefactura'}</p>
                        <p className="text-xs text-slate-500">{f.numero ? `${f.numero} · ${fechaCorta(f.fecha)}` : 'Sin emitir'}</p>
                      </div>
                      <Etiqueta color={ef.color}>{ef.texto}</Etiqueta>
                      <span className="w-24 text-right text-sm font-semibold">{euros(f.total)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>

        {(o.servicios.length > 0 || o.presupuestos.length > 0) && (
          <Tarjeta titulo="Presupuestos y servicios">
            <ul className="-my-2 divide-y divide-slate-100">
              {o.presupuestos.map((p: any) => (
                <li key={p.id}>
                  <Link to={`/presupuestos/${p.id}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">Presupuesto {p.numero}</p>
                      <p className="text-xs text-slate-500 truncate">{p.titulo}</p>
                    </div>
                    <span className="text-sm font-semibold">{euros(p.total)}</span>
                  </Link>
                </li>
              ))}
              {o.servicios.map((x: any) => (
                <li key={x.id}>
                  <Link to={`/servicios/${x.id}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{x.nombre}</p>
                      <p className="text-xs text-slate-500">{nombreTipoServicio(x.tipo)} · renueva el {fechaCorta(x.proxima_renovacion)}</p>
                    </div>
                    <span className="text-sm font-semibold">{euros(x.precio)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}

        <Tarjeta titulo="Equipo en este proyecto">
          {o.empleados.length === 0 ? <p className="text-sm text-slate-500">Nadie asignado. Puedes asignar el proyecto desde la ficha de cada persona del equipo.</p> : (
            <ul className="-my-2 divide-y divide-slate-100">
              {o.empleados.map((e: any) => (
                <li key={e.id}>
                  <Link to={`/empleados/${e.id}`} className="flex items-center gap-3 py-3">
                    <UserRound className="size-5 text-slate-400" />
                    <span className="flex-1 text-sm font-medium">{nombreCompleto(e)}</span>
                    <span className="text-xs text-slate-500">{e.puesto}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      {editar && <FormularioProyecto proyecto={o} onCerrar={() => setEditar(false)} />}
      {facturar && <FormularioFactura inicial={{ cliente_id: o.cliente_id, proyecto_id: o.id }} onCerrar={() => setFacturar(false)} />}
      <Confirmar
        abierto={terminar}
        titulo="¿Dar el proyecto por terminado?"
        texto={
          borradores.length
            ? `Quedan ${borradores.length} prefacturas sin emitir: se borrarán. Las facturas emitidas no se tocan.`
            : 'Sus facturas se conservan y puedes reactivarlo cuando quieras.'
        }
        botonSi="Terminar proyecto"
        onNo={() => setTerminar(false)}
        onSi={() => { setTerminar(false); cambiarEstado.mutate({ estado: 'terminado', borrarPrefacturas: true }); }}
      />
      <Confirmar
        abierto={rehacer}
        titulo="¿Actualizar las prefacturas?"
        texto={`Las ${borradores.length} prefacturas pendientes se rehacen con ${num(o.horas_mes)} h × ${euros(o.precio_hora)}. Si cambiaste algo a mano en alguna, se perderá. Las facturas ya emitidas no se tocan.`}
        botonSi="Actualizar"
        onNo={() => setRehacer(false)}
        onSi={() => { setRehacer(false); prefacturas.mutate(true); }}
      />
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar este proyecto?"
        texto="Las facturas ya hechas se mantienen. Si el proyecto ha acabado, mejor márcalo como «Terminado»."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(false)}
        onSi={() => { setBorrar(false); eliminar.mutate(); }}
      />
    </div>
  );
}

export function FormularioProyecto({ proyecto, clienteId, onCerrar, onCreada }: { proyecto?: any; clienteId?: string; onCerrar: () => void; onCreada?: (o: any) => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: clientes } = useQuery({ queryKey: ['clientes', ''], queryFn: () => api<any[]>('/clientes') });
  const { valores, campo, poner } = useFormulario({
    cliente_id: proyecto?.cliente_id ?? clienteId ?? '',
    nombre: proyecto?.nombre ?? '',
    referencia: proyecto?.referencia ?? '',
    tipo: proyecto?.tipo ?? 'web',
    descripcion: proyecto?.descripcion ?? '',
    url: proyecto?.url ?? '',
    concepto: proyecto?.concepto ?? 'Desarrollo de software a medida',
    modalidad: proyecto?.modalidad ?? 'hitos',
    estado: proyecto?.estado ?? 'activo',
    fecha_inicio: proyecto?.fecha_inicio ?? '',
    fecha_fin: proyecto?.fecha_fin ?? '',
    presupuesto: proyecto?.presupuesto ?? '',
    horas_mes: proyecto?.horas_mes ?? '',
    precio_hora: proyecto?.precio_hora ?? '',
    iva_pct: proyecto?.iva_pct ?? 0,
    retencion_pct: proyecto?.retencion_pct ?? 0,
    notas: proyecto?.notas ?? '',
  });
  useIvaHabitual(!proyecto, (iva) => poner('iva_pct', iva));
  const porHoras = valores.modalidad === 'horas';
  const t = calcularTotales([{ cantidad: Number(valores.horas_mes) || 0, precio: Number(valores.precio_hora) || 0 }], Number(valores.iva_pct) || 0, Number(valores.retencion_pct) || 0);

  const guardar = useMutation({
    mutationFn: () => (proyecto ? api(`/proyectos/${proyecto.id}`, { method: 'PATCH', body: valores }) : api('/proyectos', { method: 'POST', body: valores })),
    onSuccess: (r) => { qc.invalidateQueries(); avisar(proyecto ? 'Proyecto guardado' : 'Proyecto creado'); onCerrar(); onCreada?.(r); },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={proyecto ? 'Editar proyecto' : 'Nuevo proyecto'}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
    >
      {/* Primero lo imprescindible para facturar; lo opcional va plegado al final */}
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Cliente">
            <Selector {...campo('cliente_id')}>
              <option value="">Elige un cliente…</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Nombre del proyecto"><Entrada {...campo('nombre')} placeholder="Tienda online de Café Origen" /></Campo>
          <Campo etiqueta="Tipo de proyecto" className="sm:col-span-2">
            <Selector {...campo('tipo')}>
              {TIPOS_PROYECTO.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
            </Selector>
          </Campo>
        </div>

        <div className="rounded-2xl bg-marca-50/60 border border-marca-100 p-4 space-y-4">
          <p className="font-semibold text-slate-800">¿Cómo se factura?</p>
          <Filtros
            valor={valores.modalidad}
            onCambio={(v) => poner('modalidad', v)}
            opciones={[{ valor: 'hitos', texto: 'Por hitos (precio cerrado)' }, { valor: 'horas', texto: 'Por horas cada mes' }]}
          />
          {porHoras ? (
            <div className="grid grid-cols-2 gap-4">
              <Campo etiqueta="Horas previstas al mes"><Entrada type="number" inputMode="decimal" {...campo('horas_mes')} placeholder="20" /></Campo>
              <Campo etiqueta="Precio por hora €"><Entrada type="number" inputMode="decimal" step="0.01" {...campo('precio_hora')} placeholder="55" /></Campo>
            </div>
          ) : (
            <Campo etiqueta="Presupuesto total € (sin IVA)" ayuda="Luego lo repartes en hitos: diseño, desarrollo, puesta en marcha…">
              <Entrada type="number" inputMode="decimal" step="0.01" {...campo('presupuesto')} placeholder="6000" />
            </Campo>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="IVA %"><Entrada type="number" inputMode="decimal" {...campo('iva_pct')} /></Campo>
            <Campo etiqueta="Retención IRPF %" ayuda="Solo si el cliente te retiene. Si no, 0.">
              <Entrada type="number" inputMode="decimal" {...campo('retencion_pct')} />
            </Campo>
          </div>
          <Campo etiqueta="Qué pone en la factura" ayuda="Puedes escribir varias líneas: así sale en el PDF"><AreaTexto rows={2} {...campo('concepto')} /></Campo>
          {porHoras && <p className="rounded-xl bg-white px-3 py-2 text-sm">Cada mes: <b>{euros(t.total)}</b> <span className="text-slate-500">({euros(t.base)} de base)</span></p>}
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-slate-800">¿Cuánto dura?</p>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta="Empieza"><Entrada type="date" {...campo('fecha_inicio')} /></Campo>
            <Campo etiqueta="Entrega prevista"><Entrada type="date" {...campo('fecha_fin')} /></Campo>
          </div>
          {porHoras && <p className="text-xs text-slate-500">Con las dos fechas podrás preparar de una vez las prefacturas de todos los meses. Si no lo sabes, déjalo vacío.</p>}
        </div>

        <details open={!!proyecto} className="group rounded-2xl border border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
            Más datos <span className="text-sm font-normal text-slate-500">opcional</span>
          </summary>
          <div className="grid sm:grid-cols-2 gap-4 px-4 pb-4">
            <Campo etiqueta="Referencia"><Entrada {...campo('referencia')} /></Campo>
            <Campo etiqueta="Estado">
              <Selector {...campo('estado')}>
                <option value="activo">En marcha</option>
                <option value="pausado">Pausado</option>
                <option value="terminado">Terminado</option>
              </Selector>
            </Campo>
            <Campo etiqueta="Web, repositorio o entorno de pruebas" className="sm:col-span-2"><Entrada type="url" {...campo('url')} placeholder="https://" /></Campo>
            <Campo etiqueta="Descripción y alcance" className="sm:col-span-2"><AreaTexto rows={3} {...campo('descripcion')} /></Campo>
            <Campo etiqueta="Notas internas" className="sm:col-span-2"><AreaTexto {...campo('notas')} /></Campo>
          </div>
        </details>
      </div>
    </Panel>
  );
}
