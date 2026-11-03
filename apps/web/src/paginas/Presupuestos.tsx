import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Copy, Download, FileSignature, FileText, FolderKanban, Package, Pencil, Plus, Send, Trash2, Undo2, UserPlus, XCircle } from 'lucide-react';
import { calcularTotales, EstadoPresupuesto, lineaDeCatalogo, TIPOS_PROYECTO, UNIDADES } from '@stella/shared';
import { ElegirDelCatalogo } from './Catalogo';
import { api, descargar } from '../lib/api';
import { euros, fecha, fechaCorta, hoyISO } from '../lib/formato';
import {
  AreaTexto, Boton, Buscador, CabeceraDetalle, CabeceraLista, Campo, Cargando, ColorEtiqueta, Confirmar, Entrada, Etiqueta,
  FilaLista, Filtros, ListaDetalle, Panel, Selector, SinSeleccion, Vacio, useAviso,
} from '../components/ui';
import FacturaDocumento from '../components/FacturaDocumento';
import FirmaElectronica from '../components/FirmaElectronica';

type Linea = { concepto: string; cantidad: string | number; unidad: string; precio: string | number };

export function estadoPresupuesto(p: { estado: EstadoPresupuesto; caducado?: boolean }): { texto: string; color: ColorEtiqueta } {
  if (p.estado === 'enviado' && p.caducado) return { texto: 'Caducado', color: 'rojo' };
  return ({
    borrador: { texto: 'Borrador', color: 'gris' },
    enviado: { texto: 'Enviado', color: 'naranja' },
    aceptado: { texto: 'Aceptado', color: 'verde' },
    rechazado: { texto: 'Rechazado', color: 'gris' },
  } as const)[p.estado];
}

export default function Presupuestos() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<'' | EstadoPresupuesto>('');
  const [nuevo, setNuevoEstado] = useState(params.get('nuevo') === '1');
  const setNuevo = (v: boolean) => { setNuevoEstado(v); if (!v && params.has('nuevo')) setParams({}, { replace: true }); };
  const { data: lista, isLoading } = useQuery({
    queryKey: ['presupuestos', q, estado],
    queryFn: () => api<any[]>(`/presupuestos?q=${encodeURIComponent(q)}${estado ? `&estado=${estado}` : ''}`),
  });
  const enviados = (lista ?? []).filter((p) => p.estado === 'enviado' && !p.caducado);

  const columna = (
    <>
      <CabeceraLista titulo="Presupuestos" accion={<Boton icono={<Plus className="size-4" />} onClick={() => setNuevo(true)}>Nuevo</Boton>}>
        <Buscador valor={q} onCambio={setQ} texto="Buscar por número o título" />
        <Filtros
          valor={estado}
          onCambio={setEstado}
          opciones={[
            { valor: '', texto: 'Todos' },
            { valor: 'borrador', texto: 'Borradores' },
            { valor: 'enviado', texto: 'Enviados' },
            { valor: 'aceptado', texto: 'Aceptados' },
            { valor: 'rechazado', texto: 'Rechazados' },
          ]}
        />
        {!estado && enviados.length > 0 && (
          <p className="text-xs text-slate-500">
            {enviados.length === 1 ? '1 esperando respuesta' : `${enviados.length} esperando respuesta`} por {euros(enviados.reduce((t, p) => t + Number(p.base), 0))} sin IVA
          </p>
        )}
      </CabeceraLista>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <Cargando /> : !lista?.length ? (
          <Vacio
            icono={<FileSignature className="size-7" />}
            titulo={q || estado ? 'No hay resultados' : 'Aún no hay presupuestos'}
            texto="Prepara el presupuesto con sus partidas. Cuando el cliente lo acepte, se convierte en un proyecto con un hito por partida."
            accion={!q && !estado && <Boton onClick={() => setNuevo(true)}>Crear presupuesto</Boton>}
          />
        ) : (
          lista.map((p) => {
            const e = estadoPresupuesto(p);
            return (
              <FilaLista key={p.id} activa={p.id === id} onClick={() => navegar(`/presupuestos/${p.id}`)}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600"><FileSignature className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.titulo}</p>
                  <p className="truncate text-sm text-slate-500">{p.cliente?.nombre}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{p.numero} · {fechaCorta(p.fecha)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-sm font-semibold">{euros(p.total)}</span>
                  <Etiqueta color={e.color}>{e.texto}</Etiqueta>
                </div>
              </FilaLista>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <>
      <ListaDetalle hayDetalle={!!id} lista={columna} detalle={id ? <DetallePresupuesto id={id} /> : <SinSeleccion texto="Elige un presupuesto para verlo" />} />
      {nuevo && <FormularioPresupuesto onCerrar={() => setNuevo(false)} />}
    </>
  );
}

function DetallePresupuesto({ id }: { id: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  const [editar, setEditar] = useState(false);
  const [aceptar, setAceptar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [bajando, setBajando] = useState(false);
  const { data: p, isLoading } = useQuery({ queryKey: ['presupuesto', id], queryFn: () => api(`/presupuestos/${id}`) });

  const estado = useMutation({
    mutationFn: (e: EstadoPresupuesto) => api(`/presupuestos/${id}/estado`, { method: 'PATCH', body: { estado: e } }),
    onSuccess: (_r, e) => { qc.invalidateQueries(); avisar({ borrador: 'Vuelve a borrador', enviado: 'Marcado como enviado', rechazado: 'Marcado como rechazado', aceptado: '' }[e]); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const duplicar = useMutation({
    mutationFn: () => api<any>(`/presupuestos/${id}/duplicar`, { method: 'POST' }),
    onSuccess: (r) => { qc.invalidateQueries(); avisar(`Copia creada: ${r.numero}`); navegar(`/presupuestos/${r.id}`); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const alta = useMutation({
    mutationFn: () => api<any>(`/presupuestos/${id}/alta-cliente`, { method: 'POST' }),
    onSuccess: (c) => { qc.invalidateQueries(); avisar(`${c.nombre} ya está en Clientes. Revisa su ficha por si falta algún dato.`); },
    onError: (e: Error) => avisar(e.message, true),
  });
  const eliminar = useMutation({
    mutationFn: () => api(`/presupuestos/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Presupuesto borrado'); navegar('/presupuestos'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  if (isLoading || !p) return <Cargando />;
  const e = estadoPresupuesto({ estado: p.estado, caducado: p.estado === 'enviado' && !!p.valido_hasta && p.valido_hasta < hoyISO() });
  const abierto = p.estado === 'borrador' || p.estado === 'enviado';
  // Pendiente de firma o firmado: el texto ya no se toca
  const bloqueado = (p.firmas ?? []).some((f: any) => f.estado === 'pendiente' || f.estado === 'firmado');
  const firmado = (p.firmas ?? []).find((f: any) => f.estado === 'firmado');

  const pdf = async () => {
    setBajando(true);
    try {
      await descargar(`/presupuestos/${id}/pdf`, `Presupuesto ${p.numero} - ${p.cliente?.nombre ?? ''}.pdf`);
    } catch (err: any) {
      avisar(err.message, true);
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="min-h-full bg-fondo">
      <CabeceraDetalle
        volver="/presupuestos"
        titulo={`Presupuesto ${p.numero}`}
        subtitulo={
          <span className="flex items-center gap-2">
            <Etiqueta color={e.color}>{e.texto}</Etiqueta>
            {p.cliente_id ? <Link to={`/clientes/${p.cliente_id}`} className="hover:underline truncate">{p.cliente?.nombre}</Link> : <span className="truncate">{p.cliente?.nombre}</span>}
          </span>
        }
        visiblesEstrecho={2}
        acciones={
          <>
            <Boton variante="secundario" icono={<Download className="size-4" />} onClick={pdf} cargando={bajando}>PDF</Boton>
            {p.estado !== 'aceptado' && !bloqueado && <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditar(true)}>Editar</Boton>}
            {p.cliente_id
              ? <Boton variante="secundario" icono={<FileText className="size-4" />} onClick={() => navegar(`/contratos?nuevo=1&cliente=${p.cliente_id}&presupuesto=${p.id}`)}>Crear contrato</Boton>
              : <Boton variante="secundario" icono={<UserPlus className="size-4" />} onClick={() => alta.mutate()} cargando={alta.isPending}>Dar de alta como cliente</Boton>}
            <Boton variante="secundario" icono={<Copy className="size-4" />} onClick={() => duplicar.mutate()} cargando={duplicar.isPending}>Duplicar</Boton>
            {p.estado !== 'aceptado' && <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)} aria-label="Borrar" />}
          </>
        }
      />
      <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
        {abierto && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-marca-100 bg-marca-50 p-4">
            <div className="flex-1">
              <p className="font-semibold">{p.estado === 'borrador' ? '¿Listo para mandarlo?' : '¿Qué ha dicho el cliente?'}</p>
              <p className="text-sm text-slate-600">
                {p.estado === 'borrador'
                  ? 'Envíaselo a firmar desde aquí abajo, o descarga el PDF, mándaselo tú y márcalo como enviado.'
                  : `Válido hasta el ${fecha(p.valido_hasta)}. Cuando lo firme quedará aceptado solo; si te lo confirma por otro medio, márcalo tú.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
              {p.estado === 'borrador' ? (
                <Boton icono={<Send className="size-4" />} onClick={() => estado.mutate('enviado')} cargando={estado.isPending}>Marcar como enviado</Boton>
              ) : (
                <>
                  <Boton icono={<CheckCircle2 className="size-4" />} onClick={() => setAceptar(true)}>Aceptado</Boton>
                  <Boton variante="secundario" icono={<XCircle className="size-4" />} onClick={() => estado.mutate('rechazado')}>Rechazado</Boton>
                </>
              )}
            </div>
          </div>
        )}
        {p.estado === 'aceptado' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <CheckCircle2 className="size-6 text-emerald-600 shrink-0" />
            <p className="flex-1 text-emerald-900">
              {firmado ? `Firmado por ${firmado.firmante_nombre} el ${fecha(firmado.firmado_en)}.` : `Aceptado el ${fecha(p.respondido_en)}.`}
              {p.proyecto ? ' Ya es un proyecto con sus hitos.' : ' Crea el proyecto para empezar a facturar los hitos.'}
            </p>
            {p.proyecto
              ? <Boton variante="secundario" icono={<FolderKanban className="size-4" />} onClick={() => navegar(`/proyectos/${p.proyecto.id}`)}>Ver proyecto</Boton>
              : <Boton icono={<FolderKanban className="size-4" />} onClick={() => setAceptar(true)}>Crear proyecto</Boton>}
          </div>
        )}
        {p.estado === 'rechazado' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100 p-4">
            <p className="flex-1 text-slate-700">Rechazado el {fecha(p.respondido_en)}. Puedes duplicarlo para preparar otra versión.</p>
            <Boton variante="secundario" icono={<Undo2 className="size-4" />} onClick={() => estado.mutate('enviado')}>Volver a enviado</Boton>
          </div>
        )}

        <FirmaElectronica tipo="presupuesto" documento={p} puedeEnviar={abierto} nombrePdf={`Presupuesto ${p.numero} - ${p.cliente?.nombre ?? ''}${firmado ? ' (firmado)' : ''}.pdf`} />

        <FacturaDocumento f={p} />
      </div>

      {editar && <FormularioPresupuesto presupuesto={p} onCerrar={() => setEditar(false)} />}
      {aceptar && <AceptarPresupuesto presupuesto={p} onCerrar={() => setAceptar(false)} />}
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar este presupuesto?"
        texto="Se borra entero. Si el cliente lo ha rechazado, mejor márcalo como rechazado para tener el historial."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(false)}
        onSi={() => { setBorrar(false); eliminar.mutate(); }}
      />
    </div>
  );
}

function AceptarPresupuesto({ presupuesto: p, onCerrar }: { presupuesto: any; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  const [nombre, setNombre] = useState(p.titulo);
  const [tipo, setTipo] = useState('web');
  const [inicio, setInicio] = useState(hoyISO());
  const aceptar = useMutation({
    mutationFn: (crear_proyecto: boolean) =>
      api<any>(`/presupuestos/${p.id}/aceptar`, { method: 'POST', body: { crear_proyecto, nombre, tipo, fecha_inicio: inicio } }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      avisar(r.proyecto_id ? 'Presupuesto aceptado y proyecto creado' : 'Presupuesto aceptado');
      onCerrar();
      if (r.proyecto_id) navegar(`/proyectos/${r.proyecto_id}`);
    },
    onError: (e: Error) => avisar(e.message, true),
  });
  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={p.estado === 'aceptado' ? 'Crear el proyecto' : 'El cliente lo ha aceptado'}
      pie={
        <>
          {p.estado !== 'aceptado' && <Boton variante="secundario" onClick={() => aceptar.mutate(false)} disabled={aceptar.isPending}>Solo marcarlo</Boton>}
          <Boton icono={<FolderKanban className="size-4" />} onClick={() => aceptar.mutate(true)} cargando={aceptar.isPending}>Crear proyecto</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Se crea un proyecto por hitos de <b>{euros(p.base)}</b> con {p.lineas.length === 1 ? 'un hito' : `${p.lineas.length} hitos`}, uno por cada partida del presupuesto.
          Luego puedes cambiar los hitos o repartirlos de otra manera.
        </p>
        <Campo etiqueta="Nombre del proyecto"><Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Tipo">
            <Selector value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS_PROYECTO.map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Empieza"><Entrada type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></Campo>
        </div>
      </div>
    </Panel>
  );
}

function FormularioPresupuesto({ presupuesto, onCerrar }: { presupuesto?: any; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  const { data: clientes } = useQuery({ queryKey: ['clientes', ''], queryFn: () => api<any[]>('/clientes') });
  const { data: empresa } = useQuery({ queryKey: ['empresa'], queryFn: () => api('/empresa') });
  const [v, setV] = useState(() => ({
    cliente_id: presupuesto?.cliente_id ?? '',
    cliente_texto: presupuesto?.cliente_texto ?? '',
    titulo: presupuesto?.titulo ?? '',
    introduccion: presupuesto?.introduccion ?? '',
    fecha: presupuesto?.fecha ?? hoyISO(),
    valido_hasta: presupuesto?.valido_hasta ?? '',
    iva_pct: presupuesto?.iva_pct ?? 21,
    retencion_pct: presupuesto?.retencion_pct ?? 0,
    condiciones: presupuesto?.condiciones ?? '',
    notas: presupuesto?.notas ?? '',
  }));
  const [lineas, setLineas] = useState<Linea[]>(
    presupuesto?.lineas?.map((l: any) => ({ concepto: l.concepto, cantidad: l.cantidad, unidad: l.unidad, precio: l.precio })) ?? [
      { concepto: '', cantidad: 1, unidad: 'ud', precio: 0 },
    ],
  );
  const poner = (k: keyof typeof v, valor: any) => setV((x) => ({ ...x, [k]: valor }));
  // Un cliente de la lista o, si aún no lo es, sus datos escritos a mano
  const [aMano, setAMano] = useState<'lista' | 'texto'>(presupuesto && !presupuesto.cliente_id ? 'texto' : 'lista');
  const [catalogo, setCatalogo] = useState(false);
  const cambiarLinea = (i: number, k: keyof Linea, valor: string) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: valor } : l)));
  const t = calcularTotales(lineas.map((l) => ({ cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0 })), Number(v.iva_pct) || 0, Number(v.retencion_pct) || 0);

  const guardar = useMutation({
    mutationFn: () => {
      const body = {
        ...v,
        cliente_id: aMano === 'lista' ? v.cliente_id : null,
        cliente_texto: aMano === 'texto' ? v.cliente_texto : null,
        valido_hasta: v.valido_hasta || null,
        lineas,
      };
      return presupuesto ? api<any>(`/presupuestos/${presupuesto.id}`, { method: 'PATCH', body }) : api<any>('/presupuestos', { method: 'POST', body });
    },
    onSuccess: (r) => {
      qc.invalidateQueries();
      avisar(presupuesto ? 'Presupuesto guardado' : `Presupuesto ${r.numero} creado`);
      onCerrar();
      if (!presupuesto) navegar(`/presupuestos/${r.id}`);
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={presupuesto ? `Editar ${presupuesto.numero}` : 'Nuevo presupuesto'}
      ancho="max-w-2xl"
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
    >
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-700">Cliente</p>
              <Filtros valor={aMano} onCambio={setAMano} opciones={[{ valor: 'lista', texto: 'De la lista' }, { valor: 'texto', texto: 'Escribirlo' }]} />
            </div>
            {aMano === 'lista' ? (
              <Selector value={v.cliente_id} onChange={(e) => poner('cliente_id', e.target.value)} aria-label="Cliente">
                <option value="">Elige un cliente…</option>
                {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Selector>
            ) : (
              <>
                <AreaTexto
                  rows={4}
                  aria-label="Datos del cliente"
                  value={v.cliente_texto}
                  onChange={(e) => poner('cliente_texto', e.target.value)}
                  placeholder={'Panadería La Espiga S.L.\nB12345678\nC/ Mayor 3, 28013 Madrid\nhola@laespiga.es'}
                />
                <p className="text-xs text-slate-500">Una cosa por línea; la primera es el nombre. Sale tal cual en el presupuesto. Si lo acepta, se da de alta como cliente.</p>
              </>
            )}
          </div>
          <Campo etiqueta="Título" className="sm:col-span-2"><Entrada value={v.titulo} onChange={(e) => poner('titulo', e.target.value)} placeholder="Nueva web corporativa con blog" /></Campo>
          <Campo etiqueta="Fecha"><Entrada type="date" value={v.fecha} onChange={(e) => poner('fecha', e.target.value)} /></Campo>
          <Campo etiqueta="Válido hasta" ayuda={`Si lo dejas vacío, ${empresa?.validez_presupuesto_dias ?? 30} días`}>
            <Entrada type="date" value={v.valido_hasta} onChange={(e) => poner('valido_hasta', e.target.value)} />
          </Campo>
          <Campo etiqueta="Introducción (opcional)" className="sm:col-span-2" ayuda="Qué se propone y por qué, en dos o tres frases">
            <AreaTexto rows={3} value={v.introduccion} onChange={(e) => poner('introduccion', e.target.value)} />
          </Campo>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Partidas</h3>
          <p className="text-xs text-slate-500 mb-2">Cada partida será un hito del proyecto cuando el cliente lo acepte. La primera línea del concepto es el nombre del hito.</p>
          <div className="space-y-3">
            {lineas.map((l, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-3">
                <div className="flex gap-2">
                  <AreaTexto rows={3} placeholder={'Diseño UX/UI\nWireframes, prototipo navegable y diseño final de 6 pantallas'} value={l.concepto} onChange={(e) => cambiarLinea(i, 'concepto', e.target.value)} />
                  {lineas.length > 1 && (
                    <button onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="shrink-0 rounded-xl px-3 text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Quitar partida">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Campo etiqueta="Cantidad"><Entrada type="number" inputMode="decimal" step="0.01" value={l.cantidad} onChange={(e) => cambiarLinea(i, 'cantidad', e.target.value)} /></Campo>
                  <Campo etiqueta="Unidad">
                    <Selector value={l.unidad} onChange={(e) => cambiarLinea(i, 'unidad', e.target.value)}>
                      {UNIDADES.map((u) => <option key={u.clave} value={u.clave}>{u.nombre}</option>)}
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Precio €"><Entrada type="number" inputMode="decimal" step="0.01" value={l.precio} onChange={(e) => cambiarLinea(i, 'precio', e.target.value)} /></Campo>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" icono={<Package className="size-4" />} onClick={() => setCatalogo(true)}>Añadir del catálogo</Boton>
              <Boton variante="fantasma" icono={<Plus className="size-4" />} onClick={() => setLineas((ls) => [...ls, { concepto: '', cantidad: 1, unidad: 'ud', precio: 0 }])}>
                Añadir partida
              </Boton>
            </div>
          </div>
        </div>
        {catalogo && (
          <ElegirDelCatalogo
            onCerrar={() => setCatalogo(false)}
            // La partida vacía con la que empieza un presupuesto nuevo se sustituye por la primera elegida
            onElegir={(c) => setLineas((ls) => [...ls.filter((l) => l.concepto.trim() || Number(l.precio)), lineaDeCatalogo(c)])}
          />
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="IVA %"><Entrada type="number" inputMode="decimal" value={v.iva_pct} onChange={(e) => poner('iva_pct', e.target.value)} /></Campo>
          <Campo etiqueta="Retención IRPF %" ayuda="Solo si el cliente te retiene IRPF"><Entrada type="number" inputMode="decimal" value={v.retencion_pct} onChange={(e) => poner('retencion_pct', e.target.value)} /></Campo>
        </div>
        <Campo etiqueta="Condiciones" ayuda="Si lo dejas vacío, salen las de «Mi empresa»">
          <AreaTexto rows={3} value={v.condiciones} onChange={(e) => poner('condiciones', e.target.value)} placeholder={empresa?.condiciones_presupuesto ?? ''} />
        </Campo>
        <Campo etiqueta="Notas (salen en el presupuesto)"><AreaTexto value={v.notas} onChange={(e) => poner('notas', e.target.value)} /></Campo>

        <div className="rounded-xl bg-slate-50 p-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Base</span><span>{euros(t.base)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">IVA</span><span>{euros(t.iva_importe)}</span></div>
          {t.retencion_importe > 0 && <div className="flex justify-between"><span className="text-slate-500">Retención</span><span>− {euros(t.retencion_importe)}</span></div>}
          <div className="flex justify-between pt-1 text-base font-bold"><span>Total</span><span>{euros(t.total)}</span></div>
        </div>
      </div>
    </Panel>
  );
}
