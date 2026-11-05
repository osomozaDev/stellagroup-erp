import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarPlus, Check, Clock, ExternalLink, FileSignature, FolderKanban, Mail, Pencil, Phone, Plus, Send, Trash2, Trophy, UserPlus, XCircle } from 'lucide-react';
import { ETAPAS_OPORTUNIDAD, EtapaOportunidad, nombreEtapa, nombreTipoProyecto, ORIGENES_OPORTUNIDAD, TIPOS_PROYECTO } from '@stella/shared';
import { api } from '../lib/api';
import { euros, fecha, hoyISO, nombreCompleto } from '../lib/formato';
import {
  AreaTexto, Boton, Buscador, Campo, Cargando, ColorEtiqueta, Confirmar, Dato, Entrada, Etiqueta, Filtros, Panel, Selector, Tarjeta, Vacio, cx, useAviso,
} from '../components/ui';
import FormularioEvento from '../components/FormularioEvento';

const ABIERTAS = ETAPAS_OPORTUNIDAD.filter((e) => e.clave !== 'ganado' && e.clave !== 'perdido');
const colorEtapa = (e: string): ColorEtiqueta => (e === 'ganado' ? 'verde' : e === 'perdido' ? 'gris' : e === 'propuesta' ? 'naranja' : 'azul');
const fechaHora = (f: string) => new Date(f).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Crm() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [vista, setVista] = useState<'abiertas' | 'ganado' | 'perdido'>('abiertas');
  const [nueva, setNuevaEstado] = useState(params.get('nueva') === '1');
  const setNueva = (v: boolean) => { setNuevaEstado(v); if (!v && params.has('nueva')) setParams({}, { replace: true }); };
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: lista, isLoading } = useQuery({ queryKey: ['oportunidades', q], queryFn: () => api<any[]>(`/oportunidades?q=${encodeURIComponent(q)}`) });

  const mover = useMutation({
    mutationFn: ({ id, etapa }: { id: string; etapa: EtapaOportunidad }) => api(`/oportunidades/${id}/etapa`, { method: 'PATCH', body: { etapa } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oportunidades'] }),
    onError: (e: Error) => avisar(e.message, true),
  });

  const columnas = useMemo(() => Object.fromEntries(ETAPAS_OPORTUNIDAD.map((e) => [e.clave, (lista ?? []).filter((o) => o.etapa === e.clave)])), [lista]) as Record<string, any[]>;
  const suma = (l: any[]) => l.reduce((t, o) => t + Number(o.importe), 0);
  const abiertas = ABIERTAS.flatMap((e) => columnas[e.clave] ?? []);

  const tarjeta = (o: any) => (
    <button
      key={o.id}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', o.id); setArrastrando(o.id); }}
      onDragEnd={() => { setArrastrando(null); setEncima(null); }}
      onClick={() => navegar(`/crm/${o.id}`)}
      className={cx('w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-marca-200 hover:shadow', arrastrando === o.id && 'opacity-50')}
    >
      <p className="text-sm font-semibold">{o.titulo}</p>
      <p className="truncate text-xs text-slate-500">{o.con_quien}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-marca-700">{Number(o.importe) ? euros(o.importe) : 'Sin importe'}</span>
        {o.tipo_proyecto && <span className="truncate text-[11px] text-slate-400">{nombreTipoProyecto(o.tipo_proyecto)}</span>}
      </div>
      {o.proximo ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500"><Clock className="size-3 shrink-0" /><span className="truncate">{o.proximo.todo_el_dia ? new Date(o.proximo.inicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : fechaHora(o.proximo.inicio)} · {o.proximo.titulo}</span></p>
      ) : !['ganado', 'perdido'].includes(o.etapa) && (
        <p className="mt-1.5 text-[11px] text-amber-700">Sin próxima acción</p>
      )}
    </button>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 md:px-8 md:pt-8 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-48">
            <h1 className="text-2xl font-bold tracking-tight">CRM</h1>
            <p className="text-slate-500 mt-1">
              {abiertas.length ? `${abiertas.length} ${abiertas.length === 1 ? 'oportunidad abierta' : 'oportunidades abiertas'} por ${euros(suma(abiertas))}` : 'De la primera llamada al proyecto cerrado.'}
            </p>
          </div>
          <Boton icono={<Plus className="size-4" />} onClick={() => setNueva(true)}>Nueva oportunidad</Boton>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-52 max-w-sm"><Buscador valor={q} onCambio={setQ} texto="Buscar oportunidad o contacto" /></div>
          <Filtros
            valor={vista}
            onCambio={setVista}
            opciones={[
              { valor: 'abiertas', texto: 'Abiertas' },
              { valor: 'ganado', texto: `Ganadas (${columnas.ganado?.length ?? 0})` },
              { valor: 'perdido', texto: `Perdidas (${columnas.perdido?.length ?? 0})` },
            ]}
          />
        </div>
      </div>

      {isLoading ? <Cargando /> : !lista?.length ? (
        <Vacio icono={<Trophy className="size-7" />} titulo={q ? 'No hay resultados' : 'Aún no hay oportunidades'} texto="Apunta cada posible venta para no perderle la pista: con quién, cuánto y qué toca hacer." accion={!q && <Boton onClick={() => setNueva(true)}>Crear oportunidad</Boton>} />
      ) : vista === 'abiertas' ? (
        <div className="flex-1 min-h-0 overflow-x-auto px-4 md:px-8 pb-4">
          <div className="flex h-full gap-3 min-w-max">
            {ABIERTAS.map((e) => (
              <section
                key={e.clave}
                onDragOver={(ev) => { ev.preventDefault(); setEncima(e.clave); }}
                onDragLeave={() => setEncima(null)}
                onDrop={() => {
                  const o = lista.find((x) => x.id === arrastrando);
                  if (o?.etapa !== e.clave && o) {
                    // Estas etapas necesitan datos: se abre la oportunidad para completar el paso
                    if (e.clave === 'demo_solicitada' && o.etapa === 'nuevo') navegar(`/crm/${o.id}`);
                    else if (e.clave === 'demo_lista' && !o.demo_url) navegar(`/crm/${o.id}`);
                    else mover.mutate({ id: o.id, etapa: e.clave });
                  }
                  setEncima(null);
                }}
                className={cx('flex w-64 flex-col rounded-2xl bg-slate-100/80 p-2 transition', encima === e.clave && 'ring-2 ring-marca-500')}
              >
                <div className="flex items-baseline justify-between gap-2 px-1.5 py-1">
                  <h2 className="text-sm font-semibold">{e.nombre} <span className="font-normal text-slate-500">{columnas[e.clave].length}</span></h2>
                  <span className="text-xs text-slate-500">{euros(suma(columnas[e.clave]))}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-0.5">{columnas[e.clave].map(tarjeta)}</div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-4">
          {columnas[vista].length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-w-5xl">{columnas[vista].map(tarjeta)}</div> : <p className="text-sm text-slate-500">No hay ninguna.</p>}
        </div>
      )}

      {nueva && <FormularioOportunidad onCerrar={() => setNueva(false)} onCreada={(o) => navegar(`/crm/${o.id}`)} />}
      {id && <DetalleOportunidad id={id} onCerrar={() => navegar('/crm')} />}
    </div>
  );
}

function DetalleOportunidad({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  const [editar, setEditar] = useState(false);
  const [evento, setEvento] = useState<any | null>(null);
  const [nuevoEvento, setNuevoEvento] = useState(false);
  const [presentar, setPresentar] = useState(false);
  const [perder, setPerder] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [borrar, setBorrar] = useState(false);
  const { data: o, isLoading } = useQuery({ queryKey: ['oportunidad', id], queryFn: () => api(`/oportunidades/${id}`) });

  const mover = useMutation({
    mutationFn: (body: { etapa: EtapaOportunidad; motivo_perdida?: string }) => api(`/oportunidades/${id}/etapa`, { method: 'PATCH', body }),
    onSuccess: () => { qc.invalidateQueries(); setPerder(false); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const alta = useMutation({
    mutationFn: () => api<any>(`/oportunidades/${id}/alta-cliente`, { method: 'POST' }),
    onSuccess: (c) => { qc.invalidateQueries(); avisar(`${c.nombre} ya está en Clientes`); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const eliminar = useMutation({
    mutationFn: () => api(`/oportunidades/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Oportunidad borrada'); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const completar = useMutation({
    mutationFn: (e: any) => api(`/agenda/${e.id}/completado`, { method: 'PATCH', body: { completado: !e.completado_en } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oportunidad', id] }),
    onError: (e: Error) => avisar(e.message, true),
  });

  const presupuestar = () => {
    // Por el estado de la navegación, no por la dirección: lleva datos personales del contacto
    const cliente_texto = o.cliente_id ? '' : [o.contacto_empresa, o.contacto_nombre, o.contacto_email, o.contacto_telefono].filter(Boolean).join('\n');
    navegar('/presupuestos?nuevo=1', { state: { cliente_id: o.cliente_id ?? '', cliente_texto, titulo: o.titulo, tipo_proyecto: o.tipo_proyecto ?? '', oportunidad_id: id } });
  };

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={o?.titulo ?? 'Oportunidad'}
      ancho="max-w-2xl"
      pie={o && (
        <>
          <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)} aria-label="Borrar" />
          <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditar(true)}>Editar</Boton>
          <Boton icono={<FileSignature className="size-4" />} onClick={presupuestar}>Crear presupuesto</Boton>
        </>
      )}
    >
      {isLoading || !o ? <Cargando /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Etiqueta color={colorEtapa(o.etapa)}>{nombreEtapa(o.etapa)}</Etiqueta>
            <span className="text-lg font-bold">{euros(o.importe)}</span>
            {o.motivo_perdida && <span className="text-sm text-slate-500">· {o.motivo_perdida}</span>}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Mover a</p>
            <div className="flex flex-wrap gap-1.5">
              {ABIERTAS.filter((e) => (e.clave !== 'demo_solicitada' || o.demo_solicitada_en) && (e.clave !== 'demo_lista' || o.demo_url)).map((e) => (
                <button
                  key={e.clave}
                  onClick={() => mover.mutate({ etapa: e.clave })}
                  disabled={o.etapa === e.clave}
                  className={cx('rounded-full border px-3 py-1.5 text-sm', o.etapa === e.clave ? 'border-marca-500 bg-marca-50 font-semibold text-marca-700' : 'border-slate-200 hover:bg-slate-50')}
                >
                  {e.nombre}
                </button>
              ))}
              {o.etapa !== 'ganado' && <button onClick={() => mover.mutate({ etapa: 'ganado' })} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50"><Trophy className="size-3.5" />Ganada</button>}
              {o.etapa !== 'perdido' && <button onClick={() => setPerder(true)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><XCircle className="size-3.5" />Perdida</button>}
            </div>
            {perder && (
              <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                <Campo etiqueta="¿Por qué se ha perdido?"><Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus placeholder="Precio, se lo hace otro, lo deja para más adelante…" /></Campo>
                <div className="flex gap-2">
                  <Boton variante="secundario" onClick={() => setPerder(false)}>Volver</Boton>
                  <Boton onClick={() => mover.mutate({ etapa: 'perdido', motivo_perdida: motivo })} disabled={!motivo.trim()}>Marcar como perdida</Boton>
                </div>
              </div>
            )}
          </div>

          {!['ganado', 'perdido'].includes(o.etapa) || o.demo_url ? <TarjetaDemo o={o} onPresentar={() => setPresentar(true)} /> : null}

          <Tarjeta titulo="Contacto" accion={!o.cliente_id && <button onClick={() => alta.mutate()} className="inline-flex items-center gap-1 text-sm font-medium text-marca-600"><UserPlus className="size-4" />Dar de alta</button>}>
            <dl className="grid sm:grid-cols-2 gap-3">
              <Dato etiqueta="Cliente" valor={o.cliente ? <Link to={`/clientes/${o.cliente.id}`} className="text-marca-600">{o.cliente.nombre}</Link> : o.contacto_empresa ?? o.contacto_nombre} />
              <Dato etiqueta="Persona" valor={o.cliente?.contacto ?? o.contacto_nombre} />
              {(o.contacto_email ?? o.cliente?.email) && <Dato etiqueta="Correo" valor={<a href={`mailto:${o.contacto_email ?? o.cliente.email}`} className="inline-flex items-center gap-1 text-marca-600"><Mail className="size-3.5" />{o.contacto_email ?? o.cliente.email}</a>} />}
              {(o.contacto_telefono ?? o.cliente?.telefono) && <Dato etiqueta="Teléfono" valor={<a href={`tel:${o.contacto_telefono ?? o.cliente.telefono}`} className="inline-flex items-center gap-1 text-marca-600"><Phone className="size-3.5" />{o.contacto_telefono ?? o.cliente.telefono}</a>} />}
            </dl>
          </Tarjeta>

          <Tarjeta titulo="Detalles">
            <dl className="grid sm:grid-cols-2 gap-3">
              <Dato etiqueta="Qué quiere" valor={o.tipo_proyecto ? nombreTipoProyecto(o.tipo_proyecto) : null} />
              <Dato etiqueta="Cierre previsto" valor={o.cierre_previsto ? fecha(o.cierre_previsto) : null} />
              <Dato etiqueta="Origen" valor={ORIGENES_OPORTUNIDAD.find((x) => x.clave === o.origen)?.nombre} />
              <Dato etiqueta="Responsable" valor={o.responsable ? nombreCompleto(o.responsable) : null} />
              {o.notas && <div className="sm:col-span-2"><Dato etiqueta="Notas" valor={<span className="whitespace-pre-line">{o.notas}</span>} /></div>}
            </dl>
          </Tarjeta>

          <Tarjeta titulo="Agenda" accion={<button onClick={() => setNuevoEvento(true)} className="inline-flex items-center gap-1 text-sm font-medium text-marca-600"><CalendarPlus className="size-4" />Programar</button>}>
            {!o.eventos.length ? <p className="text-sm text-slate-500">Nada programado. Apunta la próxima llamada o reunión para que no se enfríe.</p> : (
              <ul className="-my-1 divide-y divide-slate-100">
                {o.eventos.map((e: any) => (
                  <li key={e.id} className="flex items-center gap-2 py-2">
                    <button onClick={() => completar.mutate(e)} aria-label="Marcar como hecho" className={cx('flex size-5 shrink-0 items-center justify-center rounded-full border-2', e.completado_en ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300')}>
                      {e.completado_en && <Check className="size-3" strokeWidth={3} />}
                    </button>
                    <button onClick={() => setEvento(e)} className="min-w-0 flex-1 text-left">
                      <span className={cx('block truncate text-sm font-medium', e.completado_en && 'text-slate-400 line-through')}>{e.titulo}</span>
                      <span className="block text-xs text-slate-500">{e.todo_el_dia ? new Date(e.inicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : fechaHora(e.inicio)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {(o.presupuestos.length > 0 || o.proyecto) && (
            <Tarjeta titulo="Presupuestos y proyecto">
              <ul className="-my-1 divide-y divide-slate-100">
                {o.presupuestos.map((p: any) => (
                  <li key={p.id}>
                    <Link to={`/presupuestos/${p.id}`} className="flex items-center gap-3 py-2">
                      <FileSignature className="size-4 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.numero} · {p.titulo}</span>
                      <span className="text-sm font-semibold">{euros(p.total)}</span>
                    </Link>
                  </li>
                ))}
                {o.proyecto && (
                  <li>
                    <Link to={`/proyectos/${o.proyecto.id}`} className="flex items-center gap-3 py-2">
                      <FolderKanban className="size-4 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.proyecto.nombre}</span>
                    </Link>
                  </li>
                )}
              </ul>
            </Tarjeta>
          )}

          {editar && <FormularioOportunidad oportunidad={o} onCerrar={() => setEditar(false)} />}
          {evento && <FormularioEvento evento={evento} onCerrar={() => setEvento(null)} />}
          {presentar && <FormularioEvento inicial={{ oportunidad_id: id, cliente_id: o.cliente_id, responsable_id: o.responsable_id, tipo: 'reunion', titulo: `Presentar demo: ${o.con_quien}`, enlaces: [{ nombre: 'Web demo', url: o.demo_url }] }} onCerrar={() => setPresentar(false)} />}
          {nuevoEvento && <FormularioEvento inicial={{ oportunidad_id: id, cliente_id: o.cliente_id, responsable_id: o.responsable_id, tipo: 'llamada', titulo: `Seguimiento: ${o.con_quien}` }} onCerrar={() => setNuevoEvento(false)} />}
          <Confirmar abierto={borrar} titulo="¿Borrar esta oportunidad?" texto="También se borran sus eventos de la agenda. Sus presupuestos se conservan." botonSi="Borrar" peligro onNo={() => setBorrar(false)} onSi={() => { setBorrar(false); eliminar.mutate(); }} />
        </div>
      )}
    </Panel>
  );
}

/** El camino de la demo: solicitarla, entregarla con su URL y presentarla */
function TarjetaDemo({ o, onPresentar }: { o: any; onPresentar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [pedir, setPedir] = useState({ sector: o.sector ?? '', requisitos: o.requisitos ?? '', demo_para: '' });
  const [lista, setLista] = useState({ url: o.demo_url ?? '', nota: '' });
  const [corregir, setCorregir] = useState(false);
  const hecho = (texto: string) => { qc.invalidateQueries(); avisar(texto); setCorregir(false); };
  const solicitar = useMutation({
    mutationFn: () => api<any>(`/oportunidades/${o.id}/solicitar-demo`, { method: 'POST', body: pedir }),
    onSuccess: () => hecho('Demo solicitada: ya tienen el aviso'),
    onError: (e: Error) => avisar(e.message, true),
  });
  const entregar = useMutation({
    mutationFn: () => api(`/oportunidades/${o.id}/demo-lista`, { method: 'POST', body: lista }),
    onSuccess: () => hecho('Demo lista: hemos avisado a quien la pidió'),
    onError: (e: Error) => avisar(e.message, true),
  });

  const formularioUrl = (
    <div className="space-y-3">
      <Campo etiqueta="URL de la demo"><Entrada inputMode="url" value={lista.url} onChange={(e) => setLista({ ...lista, url: e.target.value })} placeholder="demo.cliente.es" /></Campo>
      <Campo etiqueta="Nota para la comercial (opcional)"><Entrada value={lista.nota} onChange={(e) => setLista({ ...lista, nota: e.target.value })} placeholder="Usuario de prueba, qué enseñar primero…" /></Campo>
      <Boton icono={<Check className="size-4" />} onClick={() => entregar.mutate()} cargando={entregar.isPending} disabled={!lista.url.trim()}>Demo lista</Boton>
    </div>
  );

  // Aún sin solicitar
  if (!o.demo_solicitada_en && !o.demo_url) {
    return (
      <Tarjeta titulo="Demo">
        <div className="space-y-3">
          <Campo etiqueta="Sector del cliente"><Entrada value={pedir.sector} onChange={(e) => setPedir({ ...pedir, sector: e.target.value })} placeholder="Hostelería, clínica dental, logística…" /></Campo>
          <Campo etiqueta="Requisitos: la idea de lo que hay que crear"><AreaTexto rows={4} value={pedir.requisitos} onChange={(e) => setPedir({ ...pedir, requisitos: e.target.value })} placeholder="Web con reservas online, carta digital y galería. Le gusta el estilo de…" /></Campo>
          <Campo etiqueta="Para cuándo (opcional)"><Entrada type="date" min={hoyISO()} value={pedir.demo_para} onChange={(e) => setPedir({ ...pedir, demo_para: e.target.value })} /></Campo>
          <Boton icono={<Send className="size-4" />} onClick={() => solicitar.mutate()} cargando={solicitar.isPending}>Solicitar demo</Boton>
        </div>
      </Tarjeta>
    );
  }

  const datos = (
    <dl className="grid sm:grid-cols-2 gap-3">
      <Dato etiqueta="Sector" valor={o.sector} />
      <Dato etiqueta="Para el" valor={o.demo_para ? fecha(o.demo_para) : null} />
      <div className="sm:col-span-2"><Dato etiqueta="Requisitos" valor={<span className="whitespace-pre-line">{o.requisitos}</span>} /></div>
    </dl>
  );

  // Solicitada, a la espera de que esté hecha
  if (!o.demo_url) {
    return (
      <Tarjeta titulo="Demo solicitada">
        <div className="space-y-4">{datos}{formularioUrl}</div>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta titulo="Demo lista" accion={<button onClick={() => setCorregir((x) => !x)} className="text-sm font-medium text-marca-600">Cambiar URL</button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <a href={o.demo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-marca-600 px-4 py-2 text-sm font-semibold text-white hover:bg-marca-700"><ExternalLink className="size-4" />Abrir demo</a>
          {!['ganado', 'perdido'].includes(o.etapa) && <Boton variante="secundario" icono={<CalendarPlus className="size-4" />} onClick={onPresentar}>Programar presentación</Boton>}
        </div>
        {o.demo_nota && <p className="text-sm text-slate-600">{o.demo_nota}</p>}
        {corregir && formularioUrl}
        {datos}
      </div>
    </Tarjeta>
  );
}

function FormularioOportunidad({ oportunidad, onCerrar, onCreada }: { oportunidad?: any; onCerrar: () => void; onCreada?: (o: any) => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: clientes } = useQuery({ queryKey: ['clientes', ''], queryFn: () => api<any[]>('/clientes') });
  const { data: equipo } = useQuery({ queryKey: ['empleados', 'activos'], queryFn: () => api<any[]>('/empleados?activos=1') });
  const [aMano, setAMano] = useState<'lista' | 'texto'>(oportunidad && !oportunidad.cliente_id ? 'texto' : oportunidad ? 'lista' : 'texto');
  const [v, setV] = useState(() => ({
    titulo: oportunidad?.titulo ?? '',
    cliente_id: oportunidad?.cliente_id ?? '',
    contacto_empresa: oportunidad?.contacto_empresa ?? '',
    contacto_nombre: oportunidad?.contacto_nombre ?? '',
    contacto_email: oportunidad?.contacto_email ?? '',
    contacto_telefono: oportunidad?.contacto_telefono ?? '',
    origen: oportunidad?.origen ?? 'otro',
    tipo_proyecto: oportunidad?.tipo_proyecto ?? 'web',
    importe: oportunidad?.importe ?? '',
    cierre_previsto: oportunidad?.cierre_previsto ?? '',
    responsable_id: oportunidad?.responsable_id ?? '',
    sector: oportunidad?.sector ?? '',
    requisitos: oportunidad?.requisitos ?? '',
    notas: oportunidad?.notas ?? '',
    etapa: oportunidad?.etapa ?? 'nuevo',
  }));
  const poner = (k: keyof typeof v, valor: string) => setV((x) => ({ ...x, [k]: valor }));
  const guardar = useMutation({
    mutationFn: () => {
      const body = {
        ...v,
        importe: v.importe || 0,
        ...(aMano === 'lista'
          ? { contacto_empresa: null, contacto_nombre: null, contacto_email: null, contacto_telefono: null }
          : { cliente_id: null }),
      };
      return oportunidad ? api<any>(`/oportunidades/${oportunidad.id}`, { method: 'PATCH', body }) : api<any>('/oportunidades', { method: 'POST', body });
    },
    onSuccess: (r) => { qc.invalidateQueries(); avisar(oportunidad ? 'Guardado' : 'Oportunidad creada'); onCerrar(); onCreada?.(r); },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={oportunidad ? 'Editar oportunidad' : 'Nueva oportunidad'}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
    >
      <div className="space-y-4">
        <Campo etiqueta="Qué quiere el cliente"><Entrada value={v.titulo} onChange={(e) => poner('titulo', e.target.value)} autoFocus placeholder="Web para restaurante con reservas" /></Campo>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">Con quién</p>
            <Filtros valor={aMano} onCambio={setAMano} opciones={[{ valor: 'texto', texto: 'Contacto nuevo' }, { valor: 'lista', texto: 'Ya es cliente' }]} />
          </div>
          {aMano === 'lista' ? (
            <Selector value={v.cliente_id} onChange={(e) => poner('cliente_id', e.target.value)} aria-label="Cliente">
              <option value="">Elige un cliente…</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <Campo etiqueta="Empresa"><Entrada value={v.contacto_empresa} onChange={(e) => poner('contacto_empresa', e.target.value)} /></Campo>
              <Campo etiqueta="Persona"><Entrada value={v.contacto_nombre} onChange={(e) => poner('contacto_nombre', e.target.value)} /></Campo>
              <Campo etiqueta="Correo"><Entrada type="email" value={v.contacto_email} onChange={(e) => poner('contacto_email', e.target.value)} /></Campo>
              <Campo etiqueta="Teléfono"><Entrada type="tel" value={v.contacto_telefono} onChange={(e) => poner('contacto_telefono', e.target.value)} /></Campo>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Tipo de proyecto">
            <Selector value={v.tipo_proyecto} onChange={(e) => poner('tipo_proyecto', e.target.value)}>
              {TIPOS_PROYECTO.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Importe estimado € (sin IVA)"><Entrada type="number" inputMode="decimal" value={v.importe} onChange={(e) => poner('importe', e.target.value)} /></Campo>
          <Campo etiqueta="Cierre previsto"><Entrada type="date" min={oportunidad ? undefined : hoyISO()} value={v.cierre_previsto} onChange={(e) => poner('cierre_previsto', e.target.value)} /></Campo>
          <Campo etiqueta="Cómo nos ha llegado">
            <Selector value={v.origen} onChange={(e) => poner('origen', e.target.value)}>
              {ORIGENES_OPORTUNIDAD.map((o) => <option key={o.clave} value={o.clave}>{o.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Responsable" className="sm:col-span-2">
            <Selector value={v.responsable_id} onChange={(e) => poner('responsable_id', e.target.value)}>
              <option value="">Sin asignar</option>
              {equipo?.map((e) => <option key={e.id} value={e.id}>{nombreCompleto(e)}</option>)}
            </Selector>
          </Campo>
        </div>
        <Campo etiqueta="Notas"><AreaTexto rows={3} value={v.notas} onChange={(e) => poner('notas', e.target.value)} /></Campo>
      </div>
    </Panel>
  );
}
