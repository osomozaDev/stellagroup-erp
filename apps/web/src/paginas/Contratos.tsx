import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, Copy, Download, FileText, LayoutTemplate, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { EstadoContrato, VARIABLES_CONTRATO } from '@stella/shared';
import { api, descargar } from '../lib/api';
import { fecha, fechaCorta, hoyISO } from '../lib/formato';
import {
  AreaTexto, Boton, Buscador, CabeceraDetalle, CabeceraLista, Campo, Cargando, ColorEtiqueta, Confirmar, Entrada, Etiqueta,
  FilaLista, Filtros, Interruptor, ListaDetalle, Panel, Selector, SinSeleccion, Vacio, cx, useAviso,
} from '../components/ui';
import ContratoDocumento, { TextoContrato } from '../components/ContratoDocumento';
import FirmaElectronica from '../components/FirmaElectronica';

export const estadoContrato = (e: EstadoContrato): { texto: string; color: ColorEtiqueta } =>
  ({
    borrador: { texto: 'Borrador', color: 'gris' },
    enviado: { texto: 'Pendiente de firma', color: 'naranja' },
    firmado: { texto: 'Firmado', color: 'verde' },
    rechazado: { texto: 'Rechazado', color: 'rojo' },
    anulado: { texto: 'Anulado', color: 'gris' },
  } as const)[e];

export default function Contratos() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<'' | EstadoContrato>('');
  const [plantillas, setPlantillas] = useState(false);
  // ?nuevo=1&cliente=…&presupuesto=… abre el formulario ya relleno (lo usa el presupuesto)
  const [nuevo, setNuevoEstado] = useState(params.get('nuevo') === '1');
  const inicial = { cliente_id: params.get('cliente') ?? '', presupuesto_id: params.get('presupuesto') ?? '', proyecto_id: params.get('proyecto') ?? '' };
  const setNuevo = (v: boolean) => { setNuevoEstado(v); if (!v && params.has('nuevo')) setParams({}, { replace: true }); };
  const { data: lista, isLoading } = useQuery({
    queryKey: ['contratos', q, estado],
    queryFn: () => api<any[]>(`/contratos?q=${encodeURIComponent(q)}${estado ? `&estado=${estado}` : ''}`),
  });

  const columna = (
    <>
      <CabeceraLista
        titulo="Contratos"
        accion={
          <div className="flex gap-2">
            <Boton variante="secundario" icono={<LayoutTemplate className="size-4" />} onClick={() => setPlantillas(true)} aria-label="Plantillas">Plantillas</Boton>
            <Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>Nuevo</Boton>
          </div>
        }
      >
        <Buscador valor={q} onCambio={setQ} texto="Buscar por número o título" />
        <Filtros
          valor={estado}
          onCambio={setEstado}
          opciones={[
            { valor: '', texto: 'Todos' },
            { valor: 'borrador', texto: 'Borradores' },
            { valor: 'enviado', texto: 'Pendientes' },
            { valor: 'firmado', texto: 'Firmados' },
            { valor: 'rechazado', texto: 'Rechazados' },
            { valor: 'anulado', texto: 'Anulados' },
          ]}
        />
      </CabeceraLista>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <Cargando /> : !lista?.length ? (
          <Vacio
            icono={<FileText className="size-7" />}
            titulo={q || estado ? 'No hay resultados' : 'Aún no hay contratos'}
            texto="Elige una plantilla y un cliente: los datos se ponen solos. Luego se lo envías para que lo firme desde el móvil."
            accion={!q && !estado && <Boton onClick={() => setNuevo(true)}>Crear contrato</Boton>}
          />
        ) : (
          lista.map((c) => {
            const e = estadoContrato(c.estado);
            return (
              <FilaLista key={c.id} activa={c.id === id} onClick={() => navegar(`/contratos/${c.id}`)}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600"><FileText className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.titulo}</p>
                  <p className="truncate text-sm text-slate-500">{c.cliente?.nombre}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{c.numero} · {c.firmado_en ? `firmado el ${fechaCorta(c.firmado_en.slice(0, 10))}` : fechaCorta(c.fecha)}</p>
                </div>
                <Etiqueta color={e.color}>{e.texto}</Etiqueta>
              </FilaLista>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <>
      <ListaDetalle hayDetalle={!!id} lista={columna} detalle={id ? <DetalleContrato id={id} /> : <SinSeleccion texto="Elige un contrato para verlo" />} />
      {nuevo && <FormularioContrato inicial={inicial} onCerrar={() => setNuevo(false)} />}
      {plantillas && <Plantillas onCerrar={() => setPlantillas(false)} />}
    </>
  );
}

function DetalleContrato({ id }: { id: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  const [editar, setEditar] = useState(false);
  const [anular, setAnular] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [bajando, setBajando] = useState(false);
  const { data: c, isLoading } = useQuery({ queryKey: ['contrato', id], queryFn: () => api(`/contratos/${id}`) });

  const anularC = useMutation({
    mutationFn: () => api(`/contratos/${id}/anular`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Contrato anulado'); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const duplicar = useMutation({
    mutationFn: () => api<any>(`/contratos/${id}/duplicar`, { method: 'POST' }),
    onSuccess: (r) => { qc.invalidateQueries(); avisar(`Copia creada: ${r.numero}`); navegar(`/contratos/${r.id}`); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const eliminar = useMutation({
    mutationFn: () => api(`/contratos/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Contrato borrado'); navegar('/contratos'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  if (isLoading || !c) return <Cargando />;
  const e = estadoContrato(c.estado);
  const pendiente = (c.firmas ?? []).some((f: any) => f.estado === 'pendiente');
  const editable = ['borrador', 'rechazado'].includes(c.estado) || (c.estado === 'enviado' && !pendiente);
  const faltan = (c.cuerpo.match(/\[falta [^\]]+\]/g) ?? []).length;
  const nombrePdf = `Contrato ${c.numero} - ${c.cliente?.nombre ?? ''}${c.estado === 'firmado' ? ' (firmado)' : ''}.pdf`;

  const pdf = async () => {
    setBajando(true);
    try {
      await descargar(`/contratos/${id}/pdf`, nombrePdf);
    } catch (err: any) {
      avisar(err.message, true);
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="min-h-full bg-fondo">
      <CabeceraDetalle
        volver="/contratos"
        titulo={c.titulo}
        subtitulo={<span className="flex items-center gap-2"><Etiqueta color={e.color}>{e.texto}</Etiqueta><Link to={`/clientes/${c.cliente_id}`} className="hover:underline truncate">{c.cliente?.nombre}</Link></span>}
        visiblesEstrecho={2}
        acciones={
          <>
            <Boton variante="secundario" icono={<Download className="size-4" />} onClick={pdf} cargando={bajando}>PDF</Boton>
            {editable && <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditar(true)}>Editar</Boton>}
            <Boton variante="secundario" icono={<Copy className="size-4" />} onClick={() => duplicar.mutate()} cargando={duplicar.isPending}>Duplicar</Boton>
            {c.estado !== 'anulado' && c.estado !== 'borrador' && <Boton variante="secundario" icono={<Ban className="size-4" />} onClick={() => setAnular(true)}>Anular</Boton>}
            {c.estado === 'borrador' && <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)} aria-label="Borrar" />}
          </>
        }
      />
      <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
        {faltan > 0 && c.estado !== 'anulado' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex-1 text-sm text-amber-900">
              Le {faltan === 1 ? 'falta un dato' : `faltan ${faltan} datos`} (marcados en amarillo). Complétalos en el cliente, el proyecto o en «Mi empresa» y edita el contrato, o escríbelos a mano.
            </p>
            {editable && <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditar(true)}>Editar</Boton>}
          </div>
        )}

        {c.estado !== 'anulado' && (
          <FirmaElectronica tipo="contrato" documento={c} puedeEnviar={['borrador', 'enviado', 'rechazado'].includes(c.estado) && faltan === 0} nombrePdf={nombrePdf} />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Dato t="Número" v={c.numero} />
          <Dato t="Fecha" v={fecha(c.fecha)} />
          <Dato t="Proyecto" v={c.proyecto ? <Link to={`/proyectos/${c.proyecto.id}`} className="text-marca-600 hover:underline">{c.proyecto.nombre}</Link> : '—'} />
          <Dato t="Presupuesto" v={c.presupuesto ? <Link to={`/presupuestos/${c.presupuesto.id}`} className="text-marca-600 hover:underline">{c.presupuesto.numero}</Link> : '—'} />
        </div>
        {c.notas && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 whitespace-pre-line"><b>Notas internas:</b> {c.notas}</p>}

        <ContratoDocumento c={c} />
      </div>

      {editar && <FormularioContrato contrato={c} onCerrar={() => setEditar(false)} />}
      <Confirmar
        abierto={anular}
        titulo="¿Anular este contrato?"
        texto={c.estado === 'firmado' ? 'Se queda guardado con su firma, pero marcado como anulado (por ejemplo, si se rescinde).' : 'Si está pendiente de firma, el enlace dejará de funcionar.'}
        botonSi="Anular"
        onNo={() => setAnular(false)}
        onSi={() => { setAnular(false); anularC.mutate(); }}
      />
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar este borrador?"
        texto="Se borra del todo."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(false)}
        onSi={() => { setBorrar(false); eliminar.mutate(); }}
      />
    </div>
  );
}

const Dato = ({ t, v }: { t: string; v: React.ReactNode }) => (
  <div className="rounded-xl bg-white border border-slate-200/70 p-3">
    <p className="text-xs text-slate-500">{t}</p>
    <p className="font-medium truncate">{v}</p>
  </div>
);

function FormularioContrato({ contrato, inicial, onCerrar }: { contrato?: any; inicial?: { cliente_id: string; presupuesto_id: string; proyecto_id: string }; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  const { data: plantillas } = useQuery({ queryKey: ['plantillas-contrato'], queryFn: () => api<any[]>('/plantillas-contrato') });
  const { data: clientes } = useQuery({ queryKey: ['clientes', ''], queryFn: () => api<any[]>('/clientes') });
  const { data: proyectos } = useQuery({ queryKey: ['proyectos', ''], queryFn: () => api<any[]>('/proyectos') });
  const { data: presupuestos } = useQuery({ queryKey: ['presupuestos', '', ''], queryFn: () => api<any[]>('/presupuestos?q=') });
  const [v, setV] = useState(() => ({
    cliente_id: contrato?.cliente_id ?? inicial?.cliente_id ?? '',
    proyecto_id: contrato?.proyecto_id ?? inicial?.proyecto_id ?? '',
    presupuesto_id: contrato?.presupuesto_id ?? inicial?.presupuesto_id ?? '',
    plantilla_id: contrato?.plantilla_id ?? '',
    titulo: contrato?.titulo ?? '',
    cuerpo: contrato?.cuerpo ?? '',
    fecha: contrato?.fecha ?? hoyISO(),
    notas: contrato?.notas ?? '',
  }));
  const [vista, setVista] = useState<'escribir' | 'ver'>('escribir');
  const poner = (k: keyof typeof v, valor: string) => setV((x) => ({ ...x, [k]: valor }));
  const activas = (plantillas ?? []).filter((p) => p.activa);

  // Un contrato nuevo empieza con la plantilla de desarrollo (o la primera) elegida
  useEffect(() => {
    if (!contrato && !v.plantilla_id && activas.length) poner('plantilla_id', (activas.find((p) => /desarrollo/i.test(p.nombre)) ?? activas[0]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantillas]);

  const rellenar = useMutation({
    mutationFn: () =>
      api<any>(`/contratos/rellenar?${new URLSearchParams({ plantilla: v.plantilla_id, cliente: v.cliente_id, proyecto: v.proyecto_id, presupuesto: v.presupuesto_id, fecha: v.fecha })}`),
    onSuccess: (r) => setV((x) => ({ ...x, titulo: r.titulo, cuerpo: r.cuerpo, proyecto_id: x.proyecto_id || r.proyecto_id || '' })),
    onError: (e: Error) => avisar(e.message, true),
  });
  // En un contrato nuevo, el texto se rellena solo al tener plantilla y cliente
  useEffect(() => {
    if (!contrato && v.plantilla_id && v.cliente_id) rellenar.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.plantilla_id, v.cliente_id, v.proyecto_id, v.presupuesto_id]);

  const guardar = useMutation({
    mutationFn: () => (contrato ? api<any>(`/contratos/${contrato.id}`, { method: 'PATCH', body: v }) : api<any>('/contratos', { method: 'POST', body: v })),
    onSuccess: (r) => {
      qc.invalidateQueries();
      avisar(contrato ? 'Contrato guardado' : `Contrato ${r.numero} creado`);
      onCerrar();
      if (!contrato) navegar(`/contratos/${r.id}`);
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  const faltan = (v.cuerpo.match(/\[falta [^\]]+\]/g) ?? []).length;

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={contrato ? `Editar ${contrato.numero}` : 'Nuevo contrato'}
      ancho="max-w-3xl"
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
    >
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Cliente">
            <Selector value={v.cliente_id} onChange={(e) => setV((x) => ({ ...x, cliente_id: e.target.value, proyecto_id: '', presupuesto_id: '' }))}>
              <option value="">Elige un cliente…</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Plantilla">
            <Selector value={v.plantilla_id} onChange={(e) => poner('plantilla_id', e.target.value)}>
              <option value="">Sin plantilla</option>
              {activas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Presupuesto (opcional)">
            <Selector value={v.presupuesto_id} onChange={(e) => poner('presupuesto_id', e.target.value)} disabled={!v.cliente_id}>
              <option value="">Sin presupuesto</option>
              {(presupuestos ?? []).filter((p) => p.cliente?.id === v.cliente_id).map((p) => <option key={p.id} value={p.id}>{p.numero} · {p.titulo}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Proyecto (opcional)">
            <Selector value={v.proyecto_id} onChange={(e) => poner('proyecto_id', e.target.value)} disabled={!v.cliente_id}>
              <option value="">Sin proyecto</option>
              {(proyectos ?? []).filter((p) => p.cliente_id === v.cliente_id).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Título" className="sm:col-span-2"><Entrada value={v.titulo} onChange={(e) => poner('titulo', e.target.value)} /></Campo>
          <Campo etiqueta="Fecha"><Entrada type="date" value={v.fecha} onChange={(e) => poner('fecha', e.target.value)} /></Campo>
          {contrato && v.plantilla_id && v.cliente_id && (
            <div className="flex items-end">
              <Boton variante="secundario" icono={<Wand2 className="size-4" />} onClick={() => rellenar.mutate()} cargando={rellenar.isPending}>Volver a rellenar con la plantilla</Boton>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Texto del contrato</p>
            <Filtros valor={vista} onCambio={setVista} opciones={[{ valor: 'escribir', texto: 'Escribir' }, { valor: 'ver', texto: 'Vista previa' }]} />
          </div>
          {faltan > 0 && <p className="mb-2 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-900">Faltan {faltan} datos marcados como «[falta …]». Escríbelos aquí o complétalos en la ficha y vuelve a rellenar.</p>}
          {!v.cliente_id ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Elige el cliente y la plantilla: el texto se rellena solo con sus datos.</p>
          ) : rellenar.isPending && !v.cuerpo ? <Cargando /> : vista === 'escribir' ? (
            <>
              <AreaTexto rows={22} className="font-mono text-[13px] leading-6" value={v.cuerpo} onChange={(e) => poner('cuerpo', e.target.value)} />
              <p className="mt-1.5 text-xs text-slate-500">«# » título · «## » apartado · línea en blanco entre párrafos · «- » lista · **negrita**</p>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 p-5 text-[13px] max-h-[60vh] overflow-y-auto"><TextoContrato cuerpo={v.cuerpo} /></div>
          )}
        </div>

        <Campo etiqueta="Notas internas" ayuda="No salen en el contrato"><AreaTexto rows={2} value={v.notas} onChange={(e) => poner('notas', e.target.value)} /></Campo>
      </div>
    </Panel>
  );
}

function Plantillas({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: plantillas, isLoading } = useQuery({ queryKey: ['plantillas-contrato'], queryFn: () => api<any[]>('/plantillas-contrato') });
  const [editando, setEditando] = useState<any | null>(null);
  const [borrando, setBorrando] = useState<any | null>(null);
  const guardar = useMutation({
    mutationFn: (p: any) => (p.id ? api(`/plantillas-contrato/${p.id}`, { method: 'PUT', body: p }) : api('/plantillas-contrato', { method: 'POST', body: p })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plantillas-contrato'] }); avisar('Plantilla guardada'); setEditando(null); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/plantillas-contrato/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['plantillas-contrato'] }); avisar('Plantilla borrada'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  if (editando) {
    const p = editando;
    const poner = (k: string, valor: any) => setEditando((x: any) => ({ ...x, [k]: valor }));
    return (
      <Panel
        abierto
        onCerrar={() => setEditando(null)}
        titulo={p.id ? 'Editar plantilla' : 'Nueva plantilla'}
        ancho="max-w-3xl"
        pie={<><Boton variante="secundario" onClick={() => setEditando(null)}>Volver</Boton><Boton onClick={() => guardar.mutate(p)} cargando={guardar.isPending}>Guardar</Boton></>}
      >
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo etiqueta="Nombre"><Entrada value={p.nombre} onChange={(e) => poner('nombre', e.target.value)} /></Campo>
            <Campo etiqueta="Para qué sirve"><Entrada value={p.descripcion ?? ''} onChange={(e) => poner('descripcion', e.target.value)} /></Campo>
          </div>
          <Interruptor activo={p.activa} onChange={(x) => poner('activa', x)} etiqueta="Disponible al crear contratos" />
          <Campo etiqueta="Texto">
            <AreaTexto rows={20} className="font-mono text-[13px] leading-6" value={p.cuerpo} onChange={(e) => poner('cuerpo', e.target.value)} />
          </Campo>
          <details className="rounded-xl bg-slate-50 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">Datos que se rellenan solos</summary>
            <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {VARIABLES_CONTRATO.map(([clave, texto]) => (
                <li key={clave}><code className="text-xs text-marca-700">{`{${clave}}`}</code> <span className="text-slate-500">· {texto}</span></li>
              ))}
            </ul>
          </details>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo="Plantillas de contrato"
      pie={<Boton icono={<Plus className="size-4" />} onClick={() => setEditando({ nombre: '', descripcion: '', cuerpo: '# Contrato\n\nEn {fecha.ciudad}, a {fecha.larga}.\n\n## 1. Objeto\n\n', activa: true })}>Nueva plantilla</Boton>}
    >
      {isLoading ? <Cargando /> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {plantillas?.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3">
              <LayoutTemplate className={cx('size-5 shrink-0', p.activa ? 'text-marca-500' : 'text-slate-300')} />
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditando(p)}>
                <p className={cx('font-medium truncate', !p.activa && 'text-slate-400')}>{p.nombre}</p>
                {p.descripcion && <p className="text-xs text-slate-500 truncate">{p.descripcion}</p>}
              </button>
              <button onClick={() => setEditando(p)} className="p-2 rounded-full text-slate-400 hover:bg-slate-100" aria-label="Editar"><Pencil className="size-4" /></button>
              <button onClick={() => setBorrando(p)} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label="Borrar"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <Confirmar
        abierto={!!borrando}
        titulo="¿Borrar esta plantilla?"
        texto="Los contratos hechos con ella no cambian. Si solo quieres que no salga, desactívala."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrando(null)}
        onSi={() => { borrar.mutate(borrando.id); setBorrando(null); }}
      />
    </Panel>
  );
}
