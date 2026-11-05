import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, CalendarPlus, Trophy, CheckCircle2, Clock, FilePlus2, FileSignature, FolderKanban, Receipt, RefreshCw, Target, Wallet } from 'lucide-react';
import { nombreTipoServicio } from '@stella/shared';
import { api } from '../lib/api';
import { euros, fecha, MESES, nombreMes } from '../lib/formato';
import { Boton, Cargando, Etiqueta, Tarjeta, cx } from '../components/ui';
import { usePuede } from '../lib/permisos';
import { AvisoRebotes } from './Cobros';

export default function Inicio() {
  const navegar = useNavigate();
  const puede = usePuede();
  const { data: r, isLoading } = useQuery({ queryKey: ['inicio'], queryFn: () => api('/inicio') });
  if (isLoading || !r) return <Cargando />;

  const hora = new Date().getHours();
  const saludo = hora < 14 ? 'Buenos días' : hora < 21 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{saludo}</h1>
          <p className="text-slate-500 mt-1">Esto es lo que tienes pendiente en {nombreMes(r.periodo)}.</p>
        </div>

        {puede('cobros') && <AvisoRebotes />}

        {r.pasos && !Object.values(r.pasos).every(Boolean) && <PrimerosPasos pasos={r.pasos} />}

        {/* Lo principal según «Mi empresa → Cómo trabajáis»: presupuestos o facturar el mes */}
        {r.accion_principal === 'facturar_mes' ? (
          <Facturacion r={r} destacada />
        ) : (
          <>
            {puede('presupuestos') && <PresupuestosDestacado r={r} />}
            {puede('facturas') && <Facturacion r={r} />}
          </>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cifra icono={<Wallet />} texto="Por cobrar" valor={euros(r.por_cobrar)} a="/facturas?estado=emitida" />
          <Cifra icono={<Clock />} texto="Facturas vencidas" valor={r.vencidas.length} a="/facturas?estado=vencida" alerta={r.vencidas.length > 0} />
          <Cifra icono={<FolderKanban />} texto="Proyectos en marcha" valor={r.proyectos_activos} a="/proyectos" />
          <Cifra icono={<RefreshCw />} texto="Recurrente al mes" valor={euros(r.recurrente_mes)} a="/servicios" />
        </div>

        <div className="grid lg:grid-cols-5 gap-5">
          <GraficoFacturado r={r} />

          <Tarjeta titulo="Pendiente de cobro" className="lg:col-span-2" accion={<Link to="/facturas?estado=emitida" className="text-sm font-medium text-marca-600">Ver todas</Link>}>
            {r.pendientes.length === 0 ? (
              <p className="text-sm text-slate-500">No te deben nada. 👍</p>
            ) : (
              <ul className="-my-2 divide-y divide-slate-100">
                {r.pendientes.slice(0, 5).map((f: any) => (
                  <li key={f.id}>
                    <Link to={`/facturas/${f.id}`} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.cliente?.nombre}</p>
                        <p className={cx('text-xs', f.vencida ? 'text-red-600' : 'text-slate-500')}>
                          {f.numero} · {f.vencimiento ? `${f.vencida ? 'venció' : 'vence'} el ${fecha(f.vencimiento)}` : 'sin vencimiento'}
                        </p>
                      </div>
                      <span className="text-sm font-semibold">{euros(f.total)}</span>
                    </Link>
                  </li>
                ))}
                {r.pendientes.length > 5 && (
                  <li className="pt-2.5 text-xs text-slate-500">y {r.pendientes.length - 5} más</li>
                )}
              </ul>
            )}
          </Tarjeta>
        </div>

        {(puede('agenda') || puede('crm')) && (
          <div className="grid lg:grid-cols-2 gap-5">
            {puede('agenda') && (
              <Tarjeta titulo="Hoy en la agenda" accion={<Link to="/agenda" className="text-sm font-medium text-marca-600">Agenda</Link>}>
                {r.agenda_hoy.length === 0 ? <p className="text-sm text-slate-500">Nada pendiente para hoy.</p> : (
                  <ul className="-my-2 divide-y divide-slate-100">
                    {r.agenda_hoy.map((e: any) => {
                      const dia = new Date(e.inicio).toLocaleDateString('sv-SE');
                      const atrasado = dia < new Date().toLocaleDateString('sv-SE');
                      return (
                        <li key={e.id}>
                          <Link to="/agenda" className="flex items-center gap-3 py-2.5">
                            <CalendarDays className={cx('size-5 shrink-0', atrasado ? 'text-red-500' : 'text-marca-500')} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{e.titulo}</p>
                              <p className={cx('truncate text-xs', atrasado ? 'text-red-600' : 'text-slate-500')}>
                                {atrasado ? `Atrasado: ${fecha(dia)}` : e.todo_el_dia ? 'Todo el día' : new Date(e.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                {e.cliente?.nombre && ` · ${e.cliente.nombre}`}
                              </p>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Tarjeta>
            )}
            {puede('crm') && (
              <Link to="/crm" className="flex items-center gap-4 rounded-2xl bg-white border border-slate-200/70 p-5 hover:border-marca-200 hover:shadow-sm transition">
                <span className="inline-flex rounded-xl p-3 bg-marca-50 text-marca-600"><Trophy className="size-6" /></span>
                <div className="flex-1">
                  <p className="text-sm text-slate-500">En el embudo de ventas</p>
                  <p className="text-xl md:text-2xl font-bold tracking-tight">{euros(r.embudo.importe)}</p>
                  <p className="text-sm text-slate-500">{r.embudo.abiertas === 1 ? '1 oportunidad abierta' : `${r.embudo.abiertas} oportunidades abiertas`}</p>
                </div>
                <ArrowRight className="size-4 text-slate-400" />
              </Link>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-5">
          <Tarjeta titulo="Renovaciones en 30 días" accion={<Link to="/servicios?facturar=1" className="text-sm font-medium text-marca-600">Facturar</Link>}>
            {r.renovaciones.length === 0 ? (
              <p className="text-sm text-slate-500">Ningún hosting, dominio ni mantenimiento renueva en los próximos 30 días.</p>
            ) : (
              <ul className="-my-2 divide-y divide-slate-100">
                {r.renovaciones.slice(0, 6).map((x: any) => (
                  <li key={x.id}>
                    <Link to={`/servicios/${x.id}`} className="flex items-center gap-3 py-2.5">
                      <RefreshCw className={cx('size-5 shrink-0', x.vencida ? 'text-red-500' : 'text-marca-500')} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{x.nombre}</p>
                        <p className="truncate text-xs text-slate-500">{nombreTipoServicio(x.tipo)} · {x.cliente?.nombre}</p>
                      </div>
                      <Etiqueta color={x.vencida ? 'rojo' : 'azul'}>{x.vencida ? `Pasada ${fecha(x.proxima_renovacion)}` : fecha(x.proxima_renovacion)}</Etiqueta>
                    </Link>
                  </li>
                ))}
                {r.renovaciones.length > 6 && <li className="pt-2.5 text-xs text-slate-500">y {r.renovaciones.length - 6} más</li>}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo="Presupuestos esperando respuesta" accion={<Link to="/presupuestos" className="text-sm font-medium text-marca-600">Presupuestos</Link>}>
            {r.presupuestos_pendientes.length === 0 ? (
              <p className="text-sm text-slate-500">No hay presupuestos enviados pendientes de respuesta.</p>
            ) : (
              <ul className="-my-2 divide-y divide-slate-100">
                {r.presupuestos_pendientes.slice(0, 6).map((p: any) => (
                  <li key={p.id}>
                    <Link to={`/presupuestos/${p.id}`} className="flex items-center gap-3 py-2.5">
                      <FileSignature className="size-5 shrink-0 text-marca-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.titulo}</p>
                        <p className="truncate text-xs text-slate-500">{p.numero} · {p.cliente?.nombre}</p>
                      </div>
                      <span className="text-sm font-semibold">{euros(p.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        {r.hitos_por_facturar.length > 0 && (
          <Tarjeta titulo="Hitos entregados sin facturar">
            <ul className="-my-2 divide-y divide-slate-100">
              {r.hitos_por_facturar.map((h: any) => (
                <li key={h.id}>
                  <Link to={`/proyectos/${h.proyecto.id}`} className="flex items-center gap-3 py-2.5">
                    <Target className="size-5 shrink-0 text-marca-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{h.nombre}</p>
                      <p className="truncate text-xs text-slate-500">{h.proyecto.nombre} · {h.proyecto.cliente?.nombre} · entregado el {fecha(h.completado_en)}</p>
                    </div>
                    <span className="text-sm font-semibold">{euros(h.importe)}</span>
                    <Receipt className="size-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}

        {r.nominas_mes === 0 && r.empleados_activos > 0 && (
          <Link to="/nominas" className="flex items-center gap-3 rounded-2xl bg-white border border-slate-200/70 p-4 hover:bg-slate-50">
            <Wallet className="size-5 text-marca-600" />
            <span className="flex-1 text-sm font-medium">Aún no has preparado las nóminas de {nombreMes(r.periodo)}</span>
            <ArrowRight className="size-4 text-slate-400" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** Barras de lo facturado cada mes, con el año anterior detrás para comparar */
function GraficoFacturado({ r }: { r: any }) {
  const [activo, setActivo] = useState<number | null>(null);
  const anio = Number(r.periodo.slice(0, 4));
  const meses: { base: number; anterior: number }[] = r.facturado_por_mes;
  const max = Math.max(...meses.flatMap((m) => [m.base, m.anterior]), 1);
  const mesHoy = Number(r.periodo.slice(5, 7)) - 1;
  const comparado = r.facturado_anterior_hasta_hoy;
  const cambio = comparado > 0 ? Math.round(((r.facturado_anio - comparado) / comparado) * 100) : null;
  const m = activo !== null ? meses[activo] : null;

  return (
    <Tarjeta titulo={`Facturado en ${anio}`} className="lg:col-span-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-3xl font-bold tracking-tight">{euros(r.facturado_anio)}</p>
          <p className="text-xs text-slate-500">
            sin IVA
            {cambio !== null && (
              <>
                {' · '}
                <span className={cambio >= 0 ? 'text-emerald-700' : 'text-red-600'}>{cambio >= 0 ? '+' : ''}{cambio}%</span> que en {anio - 1} a estas alturas ({euros(comparado)})
              </>
            )}
          </p>
        </div>
        {/* Detalle del mes señalado (al pasar el ratón o tocar la barra) */}
        <div className="min-h-10 text-right text-sm">
          {m && activo !== null && (
            <>
              <p className="font-semibold capitalize">{MESES[activo]}: {euros(m.base)}</p>
              <p className="text-xs text-slate-500">{anio - 1}: {euros(m.anterior)}</p>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-end gap-1.5 h-36" onMouseLeave={() => setActivo(null)}>
        {meses.map((mes, i) => (
          <button
            key={i}
            type="button"
            className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end"
            onMouseEnter={() => setActivo(i)}
            onFocus={() => setActivo(i)}
            onClick={() => setActivo(i)}
            aria-label={`${MESES[i]}: ${euros(mes.base)}; ${anio - 1}: ${euros(mes.anterior)}`}
          >
            <div className="flex w-full h-full items-end gap-0.5">
              <div className="flex-1 rounded-sm bg-slate-200" style={{ height: `${mes.anterior ? Math.max((mes.anterior / max) * 100, 3) : 0}%` }} />
              <div
                className={cx('flex-[2] rounded-md transition', i === mesHoy ? 'bg-marca-600' : activo === i ? 'bg-marca-500' : 'bg-marca-200')}
                style={{ height: `${Math.max((mes.base / max) * 100, mes.base ? 4 : 1)}%` }}
              />
            </div>
            <span className={cx('text-[10px] uppercase', activo === i ? 'text-slate-700 font-semibold' : 'text-slate-400')}>{MESES[i].slice(0, 1)}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-marca-500" /> {anio}</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-slate-200" /> {anio - 1}</span>
      </div>
    </Tarjeta>
  );
}

function Cifra({ icono, texto, valor, a, alerta }: { icono: React.ReactNode; texto: string; valor: React.ReactNode; a: string; alerta?: boolean }) {
  return (
    <Link to={a} className="rounded-2xl bg-white border border-slate-200/70 p-4 hover:border-marca-200 hover:shadow-sm transition">
      <span className={cx('inline-flex rounded-xl p-2 [&>svg]:size-5', alerta ? 'bg-red-50 text-red-600' : 'bg-marca-50 text-marca-600')}>{icono}</span>
      <p className="mt-3 text-xl md:text-2xl font-bold tracking-tight">{valor}</p>
      <p className="text-sm text-slate-500">{texto}</p>
    </Link>
  );
}

const PASOS = [
  { clave: 'empresa', titulo: 'Completa los datos de tu empresa', texto: 'CIF, dirección y la cuenta donde te pagan. Salen en todas las facturas.', boton: 'Mis datos', a: '/ajustes' },
  { clave: 'cliente', titulo: 'Añade tu primer cliente', texto: 'La empresa para la que haces el proyecto.', boton: 'Añadir cliente', a: '/clientes?nuevo=1' },
  { clave: 'proyecto', titulo: 'Crea un proyecto', texto: 'Por hitos con un precio cerrado o por horas cada mes. También sale de aceptar un presupuesto.', boton: 'Crear proyecto', a: '/proyectos?nuevo=1' },
  { clave: 'factura', titulo: 'Haz tu primera factura', texto: 'Factura un hito entregado o las horas del mes.', boton: 'Ir a facturas', a: '/facturas' },
] as const;

/** Guía para empezar: desaparece cuando están hechos los cuatro pasos */
function PrimerosPasos({ pasos }: { pasos: Record<string, boolean> }) {
  const navegar = useNavigate();
  const hechos = PASOS.filter((p) => pasos[p.clave]).length;
  const siguiente = PASOS.find((p) => !pasos[p.clave]);
  return (
    <section className="rounded-2xl border border-marca-100 bg-white p-4 md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Primeros pasos</h2>
        <span className="text-sm text-slate-500">{hechos} de {PASOS.length}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-marca-600 transition-all" style={{ width: `${(hechos / PASOS.length) * 100}%` }} />
      </div>
      <ol className="mt-4 space-y-2">
        {PASOS.map((p, i) => {
          const hecho = pasos[p.clave];
          const actual = p === siguiente;
          return (
            <li key={p.clave} className={cx('flex items-center gap-3 rounded-xl p-3', actual && 'bg-marca-50')}>
              <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                hecho ? 'bg-emerald-100 text-emerald-700' : actual ? 'bg-marca-600 text-white' : 'bg-slate-100 text-slate-500')}>
                {hecho ? <CheckCircle2 className="size-5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cx('font-semibold', hecho && 'text-slate-400 line-through')}>{p.titulo}</p>
                {!hecho && <p className="text-sm text-slate-500">{p.texto}</p>}
              </div>
              {actual && <span className="hidden sm:block"><Boton onClick={() => navegar(p.a)}>{p.boton}</Boton></span>}
            </li>
          );
        })}
      </ol>
      {siguiente && <div className="mt-3 sm:hidden"><Boton className="w-full" onClick={() => navegar(siguiente.a)}>{siguiente.boton}</Boton></div>}
    </section>
  );
}

/** Lo que toca facturar: hitos entregados y proyectos por horas del mes. Destacada = lo principal de la empresa. */
function Facturacion({ r, destacada }: { r: any; destacada?: boolean }) {
  const navegar = useNavigate();
  const pendientes = r.hitos_por_facturar.length > 0 || r.proyectos_sin_facturar > 0;
  const titulo = [
    r.hitos_por_facturar.length && (r.hitos_por_facturar.length === 1 ? '1 hito entregado' : `${r.hitos_por_facturar.length} hitos entregados`),
    r.proyectos_sin_facturar && (r.proyectos_sin_facturar === 1 ? '1 proyecto por horas' : `${r.proyectos_sin_facturar} proyectos por horas`),
  ].filter(Boolean).join(' y ');
  const ir = () => navegar(r.hitos_por_facturar.length ? `/proyectos/${r.hitos_por_facturar[0].proyecto.id}` : '/facturar-mes');
  const boton = r.hitos_por_facturar.length ? 'Facturar hitos' : 'Facturar el mes';

  if (!destacada) {
    // Secundaria: solo sale si hay algo pendiente, como un aviso
    if (!pendientes) return null;
    return (
      <button onClick={ir} className="flex w-full items-center gap-3 rounded-2xl bg-white border border-slate-200/70 p-4 text-left hover:bg-slate-50">
        <CalendarPlus className="size-5 text-marca-600 shrink-0" />
        <span className="flex-1 text-sm"><b>Pendiente de facturar:</b> {titulo}</span>
        <span className="text-sm font-medium text-marca-600">{boton}</span>
        <ArrowRight className="size-4 text-slate-400" />
      </button>
    );
  }
  return pendientes ? (
    <div className="rounded-2xl bg-gradient-to-br from-marca-600 to-marca-700 text-white p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4">
      <div className="flex-1">
        <p className="text-marca-100 text-sm font-medium">Pendiente de facturar</p>
        <p className="text-xl md:text-2xl font-semibold mt-1">{titulo}</p>
        <p className="text-marca-100 text-sm mt-1">
          {r.hitos_por_facturar.length > 0
            ? `${euros(r.hitos_por_facturar.reduce((t: number, h: any) => t + Number(h.importe), 0))} en hitos esperando su factura.`
            : `Revisa las horas de ${nombreMes(r.periodo)} y crea todas las facturas de una vez.`}
        </p>
      </div>
      <Boton variante="secundario" className="h-12 px-6 border-0" icono={<CalendarPlus className="size-5 text-marca-600" />} onClick={ir}>{boton}</Boton>
    </div>
  ) : (
    <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5 flex items-center gap-3">
      <CheckCircle2 className="size-6 text-emerald-600 shrink-0" />
      <p className="text-emerald-800 font-medium">¡Todo facturado! No hay hitos entregados ni horas de {nombreMes(r.periodo)} sin factura.</p>
    </div>
  );
}

/** Lo principal para quien vende por proyecto: presupuestos en marcha y botón para hacer uno nuevo */
function PresupuestosDestacado({ r }: { r: any }) {
  const navegar = useNavigate();
  const p = r.presupuestos_resumen;
  const esperando = r.presupuestos_pendientes;
  const importeEsperando = esperando.reduce((t: number, x: any) => t + Number(x.total), 0);
  return (
    <div className="rounded-2xl bg-gradient-to-br from-marca-600 to-marca-700 text-white p-5 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <p className="text-marca-100 text-sm font-medium">Presupuestos</p>
          <p className="text-xl md:text-2xl font-semibold mt-1">
            {esperando.length
              ? `${esperando.length === 1 ? '1 presupuesto espera' : `${esperando.length} presupuestos esperan`} respuesta · ${euros(importeEsperando)}`
              : 'Ningún presupuesto esperando respuesta'}
          </p>
          <p className="text-marca-100 text-sm mt-1">
            {p.borradores ? `${p.borradores === 1 ? 'Tienes 1 borrador' : `Tienes ${p.borradores} borradores`} sin enviar. ` : ''}
            {`${p.hechos_mes === 1 ? '1 hecho' : `${p.hechos_mes} hechos`} en ${nombreMes(r.periodo).split(' ')[0]}.`}
          </p>
        </div>
        <Boton variante="secundario" className="h-12 px-6 border-0" icono={<FilePlus2 className="size-5 text-marca-600" />} onClick={() => navegar('/presupuestos?nuevo=1')}>
          Nuevo presupuesto
        </Boton>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <Link to="/presupuestos" className="rounded-xl bg-white/10 px-3 py-2 hover:bg-white/15">
          <p className="text-marca-100 text-xs">Aceptados este año</p>
          <p className="font-semibold">{p.aceptados_anio} · {euros(p.aceptado_anio)}</p>
        </Link>
        <Link to="/presupuestos" className="rounded-xl bg-white/10 px-3 py-2 hover:bg-white/15">
          <p className="text-marca-100 text-xs">Se aceptan</p>
          <p className="font-semibold">{p.tasa_aceptacion == null ? '—' : `${p.tasa_aceptacion} %`}</p>
        </Link>
        <Link to="/catalogo" className="rounded-xl bg-white/10 px-3 py-2 hover:bg-white/15">
          <p className="text-marca-100 text-xs">Catálogo</p>
          <p className="font-semibold">Productos y servicios</p>
        </Link>
      </div>
    </div>
  );
}
