import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, ExternalLink, Flag, Handshake, ListChecks, Phone, Plus, RefreshCw, Target, Users } from 'lucide-react';
import { api } from '../lib/api';
import { hoyISO, MESES, mesActual, moverMes, nombreCompleto, nombreMes } from '../lib/formato';
import { Boton, Cargando, Selector, Tarjeta, cx, useAviso } from '../components/ui';
import FormularioEvento from '../components/FormularioEvento';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const hora = (f: string) => new Date(f).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const diaLocal = (f: string) => {
  const d = new Date(f);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const textoDia = (d: string) => {
  const [a, m, dia] = d.split('-').map(Number);
  const semana = new Date(a, m - 1, dia).toLocaleDateString('es-ES', { weekday: 'long' });
  return `${semana} ${dia} de ${MESES[m - 1]}`;
};

const COLOR_EVENTO: Record<string, string> = {
  reunion: 'bg-marca-100 text-marca-700',
  llamada: 'bg-emerald-100 text-emerald-800',
  tarea: 'bg-amber-100 text-amber-800',
  entrega: 'bg-violet-100 text-violet-800',
  otro: 'bg-slate-100 text-slate-700',
};
const ICONO_EVENTO: Record<string, typeof Users> = { reunion: Users, llamada: Phone, tarea: ListChecks, entrega: Flag, otro: CalendarDays };
const ICONO_AVISO: Record<string, typeof Users> = { hito: Target, entrega: Flag, renovacion: RefreshCw, cierre: Handshake };

const esEnlace = (t?: string | null) => !!t && /^https?:\/\//i.test(t);
/** Los enlaces del evento y, si el lugar es una dirección web (videollamada), también ese */
const enlacesDe = (e: any): { nombre: string; url: string }[] => [
  ...(esEnlace(e.lugar) ? [{ nombre: 'Videollamada', url: e.lugar }] : []),
  ...(e.enlaces ?? []).map((l: any) => ({ nombre: l.nombre || new URL(l.url).hostname, url: l.url })),
];

/** Días que se pintan del mes: de lunes a domingo, con los del mes anterior y siguiente que completan las semanas */
function diasDelMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  const primero = new Date(Date.UTC(a, m - 1, 1));
  const inicio = new Date(primero.getTime() - ((primero.getUTCDay() + 6) % 7) * 864e5);
  const ultimo = new Date(Date.UTC(a, m, 0));
  const semanas = Math.ceil((((primero.getUTCDay() + 6) % 7) + ultimo.getUTCDate()) / 7);
  return Array.from({ length: semanas * 7 }, (_, i) => new Date(inicio.getTime() + i * 864e5).toISOString().slice(0, 10));
}

export default function Agenda() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [mes, setMes] = useState(mesActual());
  const [dia, setDia] = useState(hoyISO());
  const [editar, setEditar] = useState<any | null>(null);
  const [nuevo, setNuevo] = useState<Record<string, any> | null>(null);
  const [persona, setPersona] = useState('');
  const dias = useMemo(() => diasDelMes(mes), [mes]);
  const { data, isLoading } = useQuery({
    queryKey: ['agenda', dias[0], dias.at(-1)],
    queryFn: () => api(`/agenda?desde=${dias[0]}&hasta=${dias.at(-1)}`),
  });
  const { data: equipo } = useQuery({ queryKey: ['empleados', 'activos'], queryFn: () => api<any[]>('/empleados?activos=1') });
  const eventos: any[] = (data?.eventos ?? []).filter((e: any) => !persona || e.responsable_id === persona);
  const avisos: any[] = data?.avisos ?? [];
  const delDia = (d: string) => ({ eventos: eventos.filter((e) => diaLocal(e.inicio) === d), avisos: avisos.filter((a) => a.fecha === d) });
  const seleccion = delDia(dia);

  const completar = useMutation({
    mutationFn: (e: any) => api(`/agenda/${e.id}/completado`, { method: 'PATCH', body: { completado: !e.completado_en } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agenda'] }),
    onError: (e: Error) => avisar(e.message, true),
  });

  const nuevoEl = (d: string) => setNuevo({ inicio: new Date(`${d}T10:00`).toISOString(), responsable_id: persona || undefined });
  const irAlMes = (m: string) => { setMes(m); setDia(m === mesActual() ? hoyISO() : `${m}-01`); };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48">
            <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
            <p className="text-slate-500 mt-1">Reuniones, llamadas y tareas, con los hitos, entregas y renovaciones de cada día.</p>
          </div>
          <div className="w-44">
            <Selector aria-label="Ver la agenda de" value={persona} onChange={(e) => setPersona(e.target.value)}>
              <option value="">Todo el equipo</option>
              {equipo?.map((e) => <option key={e.id} value={e.id}>{nombreCompleto(e)}</option>)}
            </Selector>
          </div>
          <Boton icono={<Plus className="size-4" />} onClick={() => nuevoEl(dia)}>Nuevo evento</Boton>
        </div>

        <div className="grid lg:grid-cols-[1fr_20rem] gap-5 items-start">
          <section className="rounded-2xl bg-white border border-slate-200/70 overflow-hidden">
            <div className="flex items-center gap-2 p-3 border-b border-slate-100">
              <button onClick={() => irAlMes(moverMes(mes, -1))} className="p-2 rounded-full hover:bg-slate-100" aria-label="Mes anterior"><ChevronLeft className="size-5" /></button>
              <h2 className="flex-1 text-center text-lg font-semibold first-letter:uppercase">{nombreMes(`${mes}-01`)}</h2>
              <button onClick={() => irAlMes(moverMes(mes, 1))} className="p-2 rounded-full hover:bg-slate-100" aria-label="Mes siguiente"><ChevronRight className="size-5" /></button>
              {mes !== mesActual() && <Boton variante="secundario" onClick={() => irAlMes(mesActual())}>Hoy</Boton>}
            </div>
            <div className="grid grid-cols-7 border-b border-slate-100 text-center text-xs font-medium text-slate-500">
              {DIAS.map((d) => <div key={d} className="py-2">{d}</div>)}
            </div>
            {isLoading ? <Cargando /> : (
              <div className="grid grid-cols-7">
                {dias.map((d) => {
                  const { eventos: ev, avisos: av } = delDia(d);
                  const fuera = !d.startsWith(mes);
                  const total = ev.length + av.length;
                  return (
                    <button
                      key={d}
                      onClick={() => setDia(d)}
                      onDoubleClick={() => nuevoEl(d)}
                      className={cx(
                        'min-h-14 md:min-h-24 min-w-0 border-b border-r border-slate-100 p-1 md:p-1.5 text-left align-top transition hover:bg-slate-50',
                        fuera && 'bg-slate-50/60',
                        d === dia && 'bg-marca-50 hover:bg-marca-50',
                      )}
                    >
                      <span className={cx(
                        'inline-flex size-6 items-center justify-center rounded-full text-xs',
                        d === hoyISO() ? 'bg-marca-600 text-white font-bold' : fuera ? 'text-slate-400' : 'text-slate-700 font-medium',
                      )}>
                        {Number(d.slice(8))}
                      </span>
                      <span className="hidden md:block mt-1 space-y-0.5">
                        {ev.slice(0, 3).map((e) => (
                          <span key={e.id} className={cx('block truncate rounded px-1 py-0.5 text-[11px]', COLOR_EVENTO[e.tipo], e.completado_en && 'line-through opacity-60')}>
                            {!e.todo_el_dia && `${hora(e.inicio)} `}{e.titulo}
                          </span>
                        ))}
                        {av.slice(0, Math.max(0, 3 - ev.length)).map((a) => <span key={a.clave} className="block truncate px-1 text-[11px] text-slate-500">{a.titulo}</span>)}
                        {total > 3 && <span className="block px-1 text-[11px] text-slate-400">y {total - 3} más</span>}
                      </span>
                      {total > 0 && <span className="md:hidden mt-1 block size-1.5 mx-auto rounded-full bg-marca-500" />}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <Tarjeta titulo={textoDia(dia)} accion={<button onClick={() => nuevoEl(dia)} className="text-sm font-medium text-marca-600">Añadir</button>}>
            {!seleccion.eventos.length && !seleccion.avisos.length ? (
              <p className="text-sm text-slate-500">Nada este día.</p>
            ) : (
              <ul className="space-y-1">
                {seleccion.eventos.map((e) => {
                  const Icono = ICONO_EVENTO[e.tipo] ?? CalendarDays;
                  return (
                    <li key={e.id} className="flex items-start gap-2 rounded-xl p-2 hover:bg-slate-50">
                      <button
                        onClick={() => completar.mutate(e)}
                        aria-label={e.completado_en ? 'Marcar como pendiente' : 'Marcar como hecho'}
                        className={cx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2', e.completado_en ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 hover:border-marca-500')}
                      >
                        {e.completado_en && <Check className="size-3" strokeWidth={3} />}
                      </button>
                      <div className="min-w-0 flex-1">
                      <button onClick={() => setEditar(e)} className="block w-full min-w-0 text-left">
                        <span className={cx('block text-sm font-medium', e.completado_en && 'text-slate-400 line-through')}>{e.titulo}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <Icono className="size-3 shrink-0" />
                          {e.todo_el_dia ? 'Todo el día' : `${hora(e.inicio)}${e.fin ? ` – ${hora(e.fin)}` : ''}`}
                          {e.responsable && ` · ${nombreCompleto(e.responsable).split(' ')[0]}`}
                        </span>
                        {(e.cliente || e.oportunidad || e.proyecto) && (
                          <span className="block truncate text-xs text-slate-500">{e.cliente?.nombre ?? e.oportunidad?.titulo ?? e.proyecto?.nombre}</span>
                        )}
                      </button>
                      {enlacesDe(e).length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {enlacesDe(e).map((l) => (
                            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-full bg-marca-50 px-2.5 py-1 text-xs font-medium text-marca-700 hover:bg-marca-100">
                              <ExternalLink className="size-3 shrink-0" /><span className="truncate">{l.nombre}</span>
                            </a>
                          ))}
                        </span>
                      )}
                      {e.lugar && !esEnlace(e.lugar) && <span className="block text-xs text-slate-500">{e.lugar}</span>}
                      </div>
                    </li>
                  );
                })}
                {seleccion.avisos.map((a) => {
                  const Icono = ICONO_AVISO[a.tipo] ?? Clock;
                  return (
                    <li key={a.clave}>
                      <Link to={a.a} className="flex items-start gap-2 rounded-xl p-2 hover:bg-slate-50">
                        <Icono className="mt-0.5 size-4 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block text-sm text-slate-700">{a.titulo}</span>
                          {a.detalle && <span className="block truncate text-xs text-slate-500">{a.detalle}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>

      {editar && <FormularioEvento evento={editar} onCerrar={() => setEditar(null)} />}
      {nuevo && <FormularioEvento inicial={nuevo} onCerrar={() => setNuevo(null)} />}
    </div>
  );
}
