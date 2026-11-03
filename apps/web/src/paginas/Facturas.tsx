import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, CalendarPlus, CheckCircle2, Download, FileMinus, FileSpreadsheet, FileText, History, Mail, Pencil, Plus, RotateCcw, Send, Share2, Trash2 } from 'lucide-react';
import { calcularTotales, ejemploNumero } from '@stella/shared';
import { api, bajarArchivo, descargar } from '../lib/api';
import { enTelegram } from '../lib/telegram';
import { euros, fecha, fechaCorta, hoyISO, nombreMes } from '../lib/formato';
import {
  Boton, Buscador, CabeceraDetalle, CabeceraLista, Campo, Cargando, ColorEtiqueta, Confirmar, Entrada, Etiqueta,
  FilaLista, Filtros, Interruptor, ListaDetalle, Panel, Selector, SinSeleccion, Vacio, AreaTexto, cx, useAviso,
} from '../components/ui';
import FacturaDocumento from '../components/FacturaDocumento';
import { AvisoRebotes, EnviosFactura, PanelEnviarFactura, PanelHistorialEnvios } from './Cobros';
import { usePuede } from '../lib/permisos';

type Filtro = '' | 'borrador' | 'emitida' | 'vencida' | 'cobrada' | 'anulada';

const POR_PAGINA = 50;
// Desde el primer año con facturas en la app hasta el siguiente (por las prefacturas)
const ANIOS = Array.from({ length: new Date().getFullYear() - 2024 + 2 }, (_, i) => String(new Date().getFullYear() + 1 - i));

export function estadoFactura(f: { estado: string; vencimiento?: string | null; rectifica_id?: string | null; total?: number | string }): { texto: string; color: ColorEtiqueta } {
  if (f.estado === 'borrador') return { texto: 'Prefactura', color: 'azul' };
  // Una rectificativa resta: o queda saldada con la original, o hay que devolver (o cobrar) la diferencia
  if (f.rectifica_id) {
    if (f.estado === 'cobrada') return { texto: 'Rectificativa · saldada', color: 'gris' };
    if (f.estado === 'anulada') return { texto: 'Anulada', color: 'gris' };
    return Number(f.total) < 0 ? { texto: 'Rectificativa · a devolver', color: 'naranja' } : { texto: 'Rectificativa · por cobrar', color: 'naranja' };
  }
  if (f.estado === 'cobrada') return { texto: 'Cobrada', color: 'verde' };
  if (f.estado === 'anulada') return { texto: 'Anulada', color: 'gris' };
  if (f.vencimiento && f.vencimiento < hoyISO()) return { texto: 'Vencida', color: 'rojo' };
  return { texto: 'Por cobrar', color: 'naranja' };
}

export default function Facturas() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const filtro = (params.get('estado') ?? '') as Filtro;
  const anio = params.get('anio') ?? '';
  const [q, setQ] = useState('');
  const [nueva, setNueva] = useState(false);
  const [cuantas, setCuantas] = useState(POR_PAGINA);
  const [bajando, setBajando] = useState(false);
  const avisar = useAviso();

  const consulta = new URLSearchParams({ ...(filtro && { estado: filtro }), ...(anio && { anio }) }).toString();
  const { data: facturas, isLoading } = useQuery({
    queryKey: ['facturas', filtro, anio],
    queryFn: () => api<any[]>(`/facturas${consulta ? `?${consulta}` : ''}`),
  });
  // Al cambiar de filtro se vuelve a la primera página
  useEffect(() => setCuantas(POR_PAGINA), [filtro, anio, q]);

  const cambiarParams = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries(cambios).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p);
  };

  const exportar = async () => {
    setBajando(true);
    try {
      await descargar(`/facturas/excel${consulta ? `?${consulta}` : ''}`, `Facturas${anio ? ` ${anio}` : ''}.xlsx`);
    } catch (e: any) {
      avisar(e.message, true);
    } finally {
      setBajando(false);
    }
  };

  const visibles = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return facturas ?? [];
    return (facturas ?? []).filter((f) => [f.numero, f.cliente?.nombre, f.proyecto?.nombre].some((x) => x?.toLowerCase().includes(t)));
  }, [facturas, q]);

  const lista = (
    <>
      <CabeceraLista
        titulo="Facturas"
        // «Facturar el mes» ya está siempre a mano: en el menú lateral y en la barra inferior del móvil
        accion={<Boton variante="secundario" icono={<Plus className="size-4" />} onClick={() => setNueva(true)}>Factura suelta</Boton>}
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1"><Buscador valor={q} onCambio={setQ} texto="Buscar por número, cliente u proyecto" /></div>
          <div className="w-28 shrink-0">
            <Selector aria-label="Año" className="h-11 rounded-full" value={anio} onChange={(e) => cambiarParams({ anio: e.target.value })}>
              <option value="">Todos</option>
              {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Selector>
          </div>
        </div>
        <Filtros<Filtro>
          valor={filtro}
          onCambio={(v) => cambiarParams({ estado: v })}
          opciones={[
            { valor: '', texto: 'Todas' },
            { valor: 'emitida', texto: 'Por cobrar' },
            { valor: 'vencida', texto: 'Vencidas' },
            { valor: 'cobrada', texto: 'Cobradas' },
            { valor: 'borrador', texto: 'Prefacturas' },
            { valor: 'anulada', texto: 'Anuladas' },
          ]}
        />
      </CabeceraLista>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <Cargando /> : visibles.length === 0 ? (
          filtro === 'borrador' ? (
            <Vacio icono={<FileText className="size-7" />} titulo="No hay prefacturas" texto="Genéralas desde la ficha de un proyecto con «Generar prefacturas»: una por cada mes que dura." />
          ) : (
            <Vacio icono={<FileText className="size-7" />} titulo="No hay facturas" texto="Las facturas de cada mes de tus proyectos se hacen desde «Facturar el mes»." accion={<Boton icono={<CalendarPlus className="size-4" />} onClick={() => navegar('/facturar-mes')}>Facturar el mes</Boton>} />
          )
        ) : (
          visibles.slice(0, cuantas).map((f) => {
            const e = estadoFactura(f);
            return (
              <FilaLista key={f.id} activa={f.id === id} onClick={() => navegar(`/facturas/${f.id}${consulta ? `?${consulta}` : ''}`)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold text-slate-800">{f.cliente?.nombre}</p>
                    <span className="shrink-0 text-xs text-slate-500">{fechaCorta(f.fecha)}</span>
                  </div>
                  <p className="truncate text-sm text-slate-500">
                    {f.numero ?? <span className="capitalize">{f.periodo ? nombreMes(f.periodo) : 'Sin número'}</span>}
                    {f.proyecto ? ` · ${f.proyecto.nombre}` : ''}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <Etiqueta color={e.color}>{e.texto}</Etiqueta>
                      {f.rectificativas?.length > 0 && <Etiqueta>Rectificada</Etiqueta>}
                    </span>
                    <span className="font-semibold text-slate-800">{euros(f.total)}</span>
                  </div>
                </div>
              </FilaLista>
            );
          })
        )}
        {visibles.length > cuantas && (
          <div className="flex justify-center p-3">
            <Boton variante="secundario" onClick={() => setCuantas(cuantas + POR_PAGINA)}>
              Ver {Math.min(POR_PAGINA, visibles.length - cuantas)} más (quedan {visibles.length - cuantas})
            </Boton>
          </div>
        )}
      </div>
      {/* Suma de lo que se está viendo (las anuladas no cuentan) */}
      {!isLoading && visibles.length > 0 && (
        <div className="shrink-0 flex items-center gap-3 border-t border-slate-100 px-4 py-2.5 text-sm">
          <span className="min-w-0 flex-1 truncate text-slate-500">
            {visibles.length} {visibles.length === 1 ? 'factura' : 'facturas'}
            {' · '}
            <b className="text-slate-800">{euros(visibles.filter((f) => f.estado !== 'anulada').reduce((s, f) => s + Number(f.total), 0))}</b>
          </span>
          <Boton variante="fantasma" icono={<FileSpreadsheet className="size-4" />} cargando={bajando} onClick={exportar}>Excel</Boton>
        </div>
      )}
    </>
  );

  return (
    <>
      <ListaDetalle hayDetalle={!!id} lista={lista} detalle={id ? <DetalleFactura id={id} /> : <SinSeleccion texto="Elige una factura para verla" />} />
      {nueva && <FormularioFactura onCerrar={() => setNueva(false)} />}
    </>
  );
}

/**
 * PDF de la factura hecho en el propio móvil u ordenador. Si falla (p. ej. la app
 * llevaba abierta desde antes de una publicación y su generador ya no existe), se
 * pide el mismo PDF al servidor.
 */
async function crearPdf(f: any) {
  try {
    const { crearPdfFactura } = await import('../components/FacturaPdf');
    return await crearPdfFactura(f);
  } catch {
    const { blob, nombre } = await bajarArchivo(`/facturas/${f.id}/pdf`);
    return new File([blob], nombre ?? `Factura ${f.numero ?? ''}.pdf`, { type: 'application/pdf' });
  }
}

function DetalleFactura({ id }: { id: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [editar, setEditar] = useState(false);
  const [anular, setAnular] = useState(false);
  const [emitir, setEmitir] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [porEmail, setPorEmail] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [rectificar, setRectificar] = useState(false);
  const navegar = useNavigate();
  const puede = usePuede();
  const { data: f, isLoading } = useQuery({ queryKey: ['factura', id], queryFn: () => api(`/facturas/${id}`) });
  const [generando, setGenerando] = useState<'' | 'descargar' | 'compartir'>('');
  const puedeCompartir = useMemo(
    () => typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'a.pdf', { type: 'application/pdf' })] }),
    [],
  );

  // El generador de PDF pesa bastante: solo se descarga al pulsar el botón
  const sacarPdf = async (modo: 'descargar' | 'compartir') => {
    setGenerando(modo);
    // Dentro de Telegram no se pueden descargar archivos: el bot lo manda al chat
    if (enTelegram) {
      try {
        await api(`/facturas/${f.id}/pdf/telegram`, { method: 'POST' });
        avisar('Te he mandado el PDF al chat de Telegram');
      } catch (e: any) {
        avisar(e.message, true);
      } finally {
        setGenerando('');
      }
      return;
    }
    try {
      const archivo = await crearPdf(f);
      if (modo === 'compartir') {
        await navigator.share({ files: [archivo], title: archivo.name }).catch(() => {});
      } else {
        const url = URL.createObjectURL(archivo);
        const a = Object.assign(document.createElement('a'), { href: url, download: archivo.name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch {
      avisar('No se ha podido crear el PDF', true);
    } finally {
      setGenerando('');
    }
  };

  const cambiar = useMutation({
    mutationFn: (estado: string) => api(`/facturas/${id}/estado`, { method: 'PATCH', body: { estado } }),
    onSuccess: (_r, estado) => {
      qc.invalidateQueries();
      avisar(estado === 'cobrada' ? '¡Factura cobrada!' : estado === 'anulada' ? 'Factura anulada' : 'Factura marcada como pendiente');
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  const eliminar = useMutation({
    mutationFn: () => api(`/facturas/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Prefactura borrada'); navegar('/facturas?estado=borrador'); },
    onError: (err: Error) => avisar(err.message, true),
  });

  if (isLoading || !f) return <Cargando />;
  const e = estadoFactura(f);
  const borrador = f.estado === 'borrador';

  return (
    <div className="min-h-full bg-fondo">
      <CabeceraDetalle
        volver="/facturas"
        visiblesEstrecho={2}
        titulo={f.numero ?? `Prefactura${f.periodo ? ` de ${nombreMes(f.periodo)}` : ''}`}
        subtitulo={<span className="flex items-center gap-2"><Etiqueta color={e.color}>{e.texto}</Etiqueta> {f.cliente?.nombre}</span>}
        acciones={
          <>
            {borrador && (
              <Boton icono={<Send className="size-4" />} onClick={() => setEmitir(true)}>Emitir factura</Boton>
            )}
            {f.estado === 'emitida' && (
              <Boton icono={<CheckCircle2 className="size-4" />} onClick={() => cambiar.mutate('cobrada')} cargando={cambiar.isPending}>
                {f.rectifica_id ? 'Marcar saldada' : 'Marcar cobrada'}
              </Boton>
            )}
            {f.estado === 'cobrada' && (
              <Boton variante="secundario" icono={<RotateCcw className="size-4" />} onClick={() => cambiar.mutate('emitida')}>No está cobrada</Boton>
            )}
            {f.estado !== 'anulada' && (
              <Boton variante="secundario" icono={<Mail className="size-4" />} onClick={() => setPorEmail(true)}>Enviar</Boton>
            )}
            <Boton variante="secundario" icono={<Download className="size-4" />} onClick={() => sacarPdf('descargar')} cargando={generando === 'descargar'}>{enTelegram ? 'PDF al chat' : 'Descargar PDF'}</Boton>
            {puedeCompartir && !enTelegram && (
              <Boton variante="secundario" icono={<Share2 className="size-4" />} onClick={() => sacarPdf('compartir')} cargando={generando === 'compartir'}>Compartir</Boton>
            )}
            {/* Una factura emitida no se toca: se corrige con una rectificativa */}
            {borrador && (
              <Boton variante="secundario" icono={<Pencil className="size-4" />} onClick={() => setEditar(true)}>Editar</Boton>
            )}
            {(f.estado === 'emitida' || f.estado === 'cobrada') && !f.rectifica_id && (
              <Boton variante="secundario" icono={<FileMinus className="size-4" />} onClick={() => setRectificar(true)}>Rectificar</Boton>
            )}
            <Boton variante="secundario" icono={<History className="size-4" />} onClick={() => setHistorial(true)}>Historial de envíos</Boton>
            {borrador ? (
              <Boton variante="fantasma" icono={<Trash2 className="size-4" />} onClick={() => setBorrar(true)}>Borrar</Boton>
            ) : f.estado !== 'anulada' && (
              <Boton variante="fantasma" icono={<Ban className="size-4" />} onClick={() => setAnular(true)}>Anular</Boton>
            )}
          </>
        }
      />
      <div className="p-3 md:p-6 max-w-4xl mx-auto">
        {puede('cobros') && <AvisoRebotes facturaId={f.id} onReenviar={() => setPorEmail(true)} />}
        {borrador && (
          <p className="no-imprimir mb-3 rounded-xl bg-marca-50 px-4 py-3 text-sm text-marca-900">
            Esto es una <b>prefactura</b>: puedes cambiarla o enviarla al cliente para que dé el visto bueno.
            Cuando la emitas recibirá su número de factura.
          </p>
        )}
        {f.estado === 'cobrada' && f.cobrada_en && (
          <p className="no-imprimir mb-3 text-sm text-emerald-700">{f.rectifica_id ? 'Saldada' : 'Cobrada'} el {fecha(f.cobrada_en)}</p>
        )}
        {f.rectificada && (
          <p className="no-imprimir mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Rectificativa de la <Link to={`/facturas/${f.rectificada.id}`} className="font-semibold underline">factura {f.rectificada.numero}</Link>
            {f.motivo_rectificacion && <> · {f.motivo_rectificacion}</>}
          </p>
        )}
        {f.rectificativas?.length > 0 && (
          <p className="no-imprimir mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Esta factura está rectificada por{' '}
            {f.rectificativas.map((r: any, i: number) => (
              <span key={r.id}>
                {i > 0 && ', '}
                <Link to={`/facturas/${r.id}`} className="font-semibold underline">{r.numero}</Link> ({euros(Number(r.total))})
              </span>
            ))}
            .
          </p>
        )}
        <FacturaDocumento f={f} />
        <EnviosFactura facturaId={f.id} prefactura={!f.numero} />
      </div>
      {editar && <FormularioFactura factura={f} onCerrar={() => setEditar(false)} />}
      {emitir && <EmitirPrefactura factura={f} onCerrar={() => setEmitir(false)} />}
      {porEmail && <PanelEnviarFactura facturaId={f.id} onCerrar={() => setPorEmail(false)} />}
      {rectificar && <PanelRectificar factura={f} onCerrar={() => setRectificar(false)} />}
      {historial && <PanelHistorialEnvios facturaId={f.id} prefactura={!f.numero} onCerrar={() => setHistorial(false)} />}
      <Confirmar
        abierto={borrar}
        titulo="¿Borrar esta prefactura?"
        texto="No tiene número, así que se puede borrar sin problema."
        botonSi="Borrar"
        peligro
        onNo={() => setBorrar(false)}
        onSi={() => { setBorrar(false); eliminar.mutate(); }}
      />
      <Confirmar
        abierto={anular}
        titulo="¿Anular esta factura?"
        texto="La factura se queda guardada pero deja de contar. Si te equivocaste, crea una nueva correcta."
        botonSi="Anular factura"
        peligro
        onNo={() => setAnular(false)}
        onSi={() => { setAnular(false); cambiar.mutate('anulada'); }}
      />
    </div>
  );
}

type Linea = { concepto: string; cantidad: string | number; unidad: string; precio: string | number };

const MOTIVOS = ['Error en las horas facturadas', 'Error en el precio', 'Error en los datos del cliente', 'Trabajo no realizado o devuelto', 'Descuento acordado después'];

/**
 * Emite una factura rectificativa (serie R). Anular entera deja la original a cero;
 * corregir importes resta lo de la original y suma lo correcto.
 */
function PanelRectificar({ factura: f, onCerrar }: { factura: any; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  const [modo, setModo] = useState<'total' | 'corregir'>('corregir');
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [otro, setOtro] = useState('');
  const [fechaR, setFechaR] = useState(hoyISO());
  const [lineas, setLineas] = useState<Linea[]>(() =>
    f.lineas.map((l: any) => ({ concepto: l.concepto, cantidad: Number(l.cantidad), unidad: l.unidad, precio: Number(l.precio) })),
  );
  const iva = Number(f.iva_pct);
  const ret = Number(f.retencion_pct);
  const num = (l: Linea) => ({ cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0 });
  const correcto = calcularTotales(lineas.map(num), iva, ret);
  const diferencia = modo === 'total' ? -Number(f.total) : Math.round((correcto.total - Number(f.total)) * 100) / 100;
  const textoMotivo = motivo === 'otro' ? otro.trim() : motivo;

  const emitir = useMutation({
    mutationFn: () =>
      api<any>(`/facturas/${f.id}/rectificar`, {
        method: 'POST',
        body: {
          motivo: textoMotivo,
          fecha: fechaR,
          lineas_correctas: modo === 'total' ? null : lineas.map((l) => ({ ...l, ...num(l) })),
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      avisar(`Rectificativa ${r.numero} emitida`);
      onCerrar();
      navegar(`/facturas/${r.id}`);
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  const cambiar = (i: number, campo: keyof Linea, v: string) => setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={`Rectificar la factura ${f.numero}`}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton
            icono={<FileMinus className="size-4" />}
            cargando={emitir.isPending}
            onClick={() => {
              if (!textoMotivo) return avisar('Escribe el motivo de la rectificación', true);
              if (modo === 'corregir' && diferencia === 0) return avisar('No has cambiado nada: la factura correcta es igual que la original', true);
              emitir.mutate();
            }}
          >
            Emitir rectificativa
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-500">
          Una factura emitida no se cambia ni se borra: se corrige con una <b>factura rectificativa</b>, con su propio número (serie R),
          que dice qué factura corrige y por qué.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {([
            ['corregir', 'Corregir importes', 'Cambias horas, precio o el concepto'],
            ['total', 'Anularla entera', 'La factura queda a cero'],
          ] as const).map(([v, t, d]) => (
            <button
              key={v}
              type="button"
              onClick={() => setModo(v)}
              className={cx('rounded-xl border p-3 text-left transition', modo === v ? 'border-marca-500 bg-marca-50 ring-1 ring-marca-500' : 'border-slate-200 hover:bg-slate-50')}
            >
              <p className="font-semibold text-sm">{t}</p>
              <p className="text-xs text-slate-500 mt-0.5">{d}</p>
            </button>
          ))}
        </div>

        <Campo etiqueta="¿Qué estaba mal?">
          <Selector value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
            <option value="otro">Otro motivo…</option>
          </Selector>
        </Campo>
        {motivo === 'otro' && (
          <Campo etiqueta="Explica el motivo">
            <Entrada value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Se facturó el proyecto equivocada" />
          </Campo>
        )}

        {modo === 'corregir' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Cómo tendría que haber sido</p>
            {lineas.map((l, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2">
                <AreaTexto rows={2} value={l.concepto} onChange={(e) => cambiar(i, 'concepto', e.target.value)} aria-label="Concepto" />
                <div className="grid grid-cols-2 gap-2">
                  <Campo etiqueta={`Cantidad (${l.unidad})`}>
                    <Entrada type="number" inputMode="decimal" value={l.cantidad} onChange={(e) => cambiar(i, 'cantidad', e.target.value)} />
                  </Campo>
                  <Campo etiqueta="Precio">
                    <Entrada type="number" inputMode="decimal" value={l.precio} onChange={(e) => cambiar(i, 'precio', e.target.value)} />
                  </Campo>
                </div>
              </div>
            ))}
          </div>
        )}

        <Campo etiqueta="Fecha de la rectificativa">
          <Entrada type="date" value={fechaR} onChange={(e) => setFechaR(e.target.value)} />
        </Campo>

        <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Factura {f.numero}</span><span>{euros(Number(f.total))}</span></div>
          {modo === 'corregir' && <div className="flex justify-between"><span className="text-slate-500">Lo correcto</span><span>{euros(correcto.total)}</span></div>}
          <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold">
            <span>Rectificativa</span>
            <span className={diferencia < 0 ? 'text-red-600' : ''}>{euros(diferencia)}</span>
          </div>
          <p className="text-xs text-slate-500 pt-1">
            {modo === 'total'
              ? f.estado === 'emitida'
                ? 'Como la factura no estaba cobrada, las dos quedan saldadas y dejan de estar pendientes.'
                : 'La factura ya estaba cobrada: la rectificativa queda pendiente de devolver al cliente.'
              : diferencia < 0
                ? 'El cliente pagará esta cantidad menos (o se le devolverá si ya pagó).'
                : 'El cliente tendrá que pagar esta diferencia además de la factura.'}
          </p>
        </div>
      </div>
    </Panel>
  );
}

export function FormularioFactura({ factura, onCerrar, inicial }: { factura?: any; onCerrar: () => void; inicial?: { cliente_id?: string; proyecto_id?: string } }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navegar = useNavigate();
  const { data: clientes } = useQuery({ queryKey: ['clientes', ''], queryFn: () => api<any[]>('/clientes') });
  const { data: proyectos } = useQuery({ queryKey: ['proyectos', ''], queryFn: () => api<any[]>('/proyectos') });

  const [v, setV] = useState(() => ({
    cliente_id: factura?.cliente_id ?? inicial?.cliente_id ?? '',
    proyecto_id: factura?.proyecto_id ?? inicial?.proyecto_id ?? '',
    fecha: factura?.fecha ?? hoyISO(),
    vencimiento: factura?.vencimiento ?? '',
    periodo: factura?.periodo?.slice(0, 7) ?? '',
    iva_pct: factura?.iva_pct ?? 21,
    retencion_pct: factura?.retencion_pct ?? 0,
    notas: factura?.notas ?? '',
  }));
  const [lineas, setLineas] = useState<Linea[]>(
    factura?.lineas?.map((l: any) => ({ concepto: l.concepto, cantidad: l.cantidad, unidad: l.unidad, precio: l.precio })) ?? [
      { concepto: '', cantidad: 1, unidad: 'ud', precio: 0 },
    ],
  );
  const poner = (k: keyof typeof v, valor: any) => setV((x) => ({ ...x, [k]: valor }));

  const proyectosCliente = (proyectos ?? []).filter((o) => o.cliente_id === v.cliente_id);

  // Al elegir proyecto, rellenamos lo que ya sabemos de él
  const elegirProyecto = (proyecto_id: string) => {
    const o = proyectos?.find((x) => x.id === proyecto_id);
    setV((x) => ({
      ...x,
      proyecto_id,
      ...(o && { iva_pct: o.iva_pct, retencion_pct: o.retencion_pct }),
    }));
    if (o && !factura && lineas.length === 1 && !lineas[0].concepto) {
      setLineas([o.modalidad === 'horas' ? { concepto: o.concepto, cantidad: o.horas_mes, unidad: 'h', precio: o.precio_hora } : { concepto: o.concepto, cantidad: 1, unidad: 'ud', precio: 0 }]);
    }
  };

  useEffect(() => {
    if (inicial?.proyecto_id && proyectos) elegirProyecto(inicial.proyecto_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectos]);

  const t = calcularTotales(
    lineas.map((l) => ({ cantidad: Number(l.cantidad) || 0, precio: Number(l.precio) || 0 })),
    Number(v.iva_pct) || 0,
    Number(v.retencion_pct) || 0,
  );

  const guardar = useMutation({
    mutationFn: (comoBorrador: boolean) => {
      const body = { ...v, proyecto_id: v.proyecto_id || null, periodo: v.periodo || null, vencimiento: v.vencimiento || null, lineas, borrador: comoBorrador };
      return factura ? api(`/facturas/${factura.id}`, { method: 'PATCH', body }) : api('/facturas', { method: 'POST', body });
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      avisar(factura ? 'Guardado' : r.numero ? `Factura ${r.numero} creada` : 'Prefactura guardada');
      onCerrar();
      if (!factura) navegar(`/facturas/${r.id}`);
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  const cambiarLinea = (i: number, k: keyof Linea, valor: string) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: valor } : l)));

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={factura ? `Editar ${factura.numero ?? 'prefactura'}` : 'Factura suelta'}
      ancho="max-w-2xl"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          {!factura && (
            <Boton variante="secundario" onClick={() => guardar.mutate(true)} cargando={guardar.isPending && guardar.variables}>Guardar como prefactura</Boton>
          )}
          <Boton onClick={() => guardar.mutate(factura?.estado === 'borrador')} cargando={guardar.isPending && !guardar.variables}>
            {factura ? 'Guardar cambios' : 'Crear factura'}
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        {!factura && (
          <div className="flex items-start gap-3 rounded-xl bg-marca-50 p-3 text-sm text-marca-900">
            <CalendarPlus className="size-5 shrink-0 text-marca-600" />
            <p>
              Esto es para trabajos sueltos. Los hitos se facturan desde su proyecto y las horas de cada mes en{' '}
              <button type="button" className="font-semibold underline" onClick={() => { onCerrar(); navegar('/facturar-mes'); }}>Facturar el mes</button>
              , que no deja facturar dos veces el mismo mes.
            </p>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="Cliente">
            <Selector value={v.cliente_id} onChange={(e) => setV((x) => ({ ...x, cliente_id: e.target.value, proyecto_id: '' }))}>
              <option value="">Elige un cliente…</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Proyecto (opcional)">
            <Selector value={v.proyecto_id} onChange={(e) => elegirProyecto(e.target.value)} disabled={!v.cliente_id}>
              <option value="">Sin proyecto</option>
              {proyectosCliente.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </Selector>
          </Campo>
          <Campo etiqueta="Fecha de la factura">
            <Entrada type="date" value={v.fecha} onChange={(e) => poner('fecha', e.target.value)} />
          </Campo>
          <Campo etiqueta="Vence el" ayuda="Si lo dejas vacío, se calcula solo">
            <Entrada type="date" value={v.vencimiento} onChange={(e) => poner('vencimiento', e.target.value)} />
          </Campo>
          {v.proyecto_id && (
            <Campo etiqueta="Mes que se factura" ayuda={v.periodo ? nombreMes(`${v.periodo}-01`) : 'Para no facturar dos veces el mismo mes'}>
              <Entrada type="month" value={v.periodo} onChange={(e) => poner('periodo', e.target.value)} />
            </Campo>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">¿Qué se factura?</h3>
          <div className="space-y-3">
            {lineas.map((l, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-3">
                <div className="flex gap-2">
                  <AreaTexto rows={3} placeholder={'Concepto (puedes usar varias líneas)\nDesarrollo del módulo de reservas…'} value={l.concepto} onChange={(e) => cambiarLinea(i, 'concepto', e.target.value)} />
                  {lineas.length > 1 && (
                    <button onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="shrink-0 rounded-xl px-3 text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label="Quitar línea">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Campo etiqueta="Cantidad"><Entrada type="number" inputMode="decimal" step="0.01" value={l.cantidad} onChange={(e) => cambiarLinea(i, 'cantidad', e.target.value)} /></Campo>
                  <Campo etiqueta="Unidad">
                    <Selector value={l.unidad} onChange={(e) => cambiarLinea(i, 'unidad', e.target.value)}>
                      <option value="h">horas</option>
                      <option value="ud">unidades</option>
                      <option value="mes">meses</option>
                      <option value="año">años</option>
                      <option value="pa">partida</option>
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Precio €"><Entrada type="number" inputMode="decimal" step="0.01" value={l.precio} onChange={(e) => cambiarLinea(i, 'precio', e.target.value)} /></Campo>
                </div>
              </div>
            ))}
            <Boton variante="fantasma" icono={<Plus className="size-4" />} onClick={() => setLineas((ls) => [...ls, { concepto: '', cantidad: 1, unidad: 'ud', precio: 0 }])}>
              Añadir otra línea
            </Boton>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Campo etiqueta="IVA %"><Entrada type="number" inputMode="decimal" value={v.iva_pct} onChange={(e) => poner('iva_pct', e.target.value)} /></Campo>
          <Campo etiqueta="Retención IRPF %" ayuda="Solo si el cliente te retiene IRPF (facturas de profesionales)"><Entrada type="number" inputMode="decimal" value={v.retencion_pct} onChange={(e) => poner('retencion_pct', e.target.value)} /></Campo>
        </div>
        <Campo etiqueta="Notas (salen en la factura)">
          <AreaTexto value={v.notas} onChange={(e) => poner('notas', e.target.value)} />
        </Campo>

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

/** Emitir una prefactura: elige la fecha y recibe su número */
function EmitirPrefactura({ factura, onCerrar }: { factura: any; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: empresa } = useQuery({ queryKey: ['empresa'], queryFn: () => api('/empresa') });
  const [fechaEmision, setFechaEmision] = useState<string>(factura.fecha ?? hoyISO());
  const emitir = useMutation({
    mutationFn: () => api(`/facturas/${factura.id}/emitir`, { method: 'POST', body: { fecha: fechaEmision } }),
    onSuccess: (r: any) => { qc.invalidateQueries(); avisar(`Factura ${r.numero} emitida`); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });
  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo="Emitir factura"
      ancho="max-w-md"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton icono={<Send className="size-4" />} onClick={() => emitir.mutate()} cargando={emitir.isPending}>Emitir</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-slate-600">
          La prefactura de <b>{factura.cliente?.nombre}</b> por <b>{euros(factura.total)}</b> pasará a ser una factura
          {empresa ? <> con el número <b>{ejemploNumero(empresa.serie_factura ?? '', empresa.numeracion, empresa.proximo_numero)}</b></> : null}.
          Después ya no se podrá borrar, solo anular.
        </p>
        <Campo etiqueta="Fecha de la factura">
          <Entrada type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
        </Campo>
      </div>
    </Panel>
  );
}
