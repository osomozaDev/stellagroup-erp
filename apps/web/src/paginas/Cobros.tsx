import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, BellRing, CheckCircle2, History, Mail, Send } from 'lucide-react';
import { asuntoFactura, mensajeFactura } from '@stella/shared';
import { api, aBase64 } from '../lib/api';
import { euros, fecha, nombreMes } from '../lib/formato';
import {
  AreaTexto, Boton, Campo, Cargando, Entrada, Etiqueta, Interruptor, Panel, Selector, Tarjeta, Vacio, cx, useAviso,
} from '../components/ui';

const haceDias = (iso: string) => {
  const d = Math.round((Date.now() - Date.parse(iso)) / 864e5);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
};

export default function Cobros() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: r, isLoading } = useQuery({ queryKey: ['cobros'], queryFn: () => api('/cobros') });
  const [recordar, setRecordar] = useState<any>(null);
  const [enviar, setEnviar] = useState<any>(null);

  const cobrada = useMutation({
    mutationFn: (id: string) => api(`/facturas/${id}/estado`, { method: 'PATCH', body: { estado: 'cobrada' } }),
    onSuccess: () => { qc.invalidateQueries(); avisar('¡Factura cobrada!'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  if (isLoading || !r) return <Cargando />;
  const vencidas = r.facturas.filter((f: any) => f.dias_vencida > 0);
  const porVencer = r.facturas.filter((f: any) => !(f.dias_vencida > 0));
  const suma = (l: any[]) => l.reduce((s, f) => s + Number(f.total), 0);
  const clientesVencidos = new Set(vencidas.map((f: any) => f.cliente?.id)).size;

  const filaFactura = (f: any, vencida: boolean) => (
    <li key={f.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <Link to={`/facturas/${f.id}`} className="min-w-0 flex-1">
        <p className="truncate font-semibold">{f.cliente?.nombre}</p>
        <p className="truncate text-sm text-slate-500">
          Factura {f.numero} · {euros(f.total)}
          {f.proyecto && ` · ${f.proyecto.nombre}`}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {vencida ? (
            <Etiqueta color="rojo">Vencida hace {f.dias_vencida} {f.dias_vencida === 1 ? 'día' : 'días'}</Etiqueta>
          ) : f.vencimiento ? (
            <Etiqueta color="naranja">Vence el {fecha(f.vencimiento)}</Etiqueta>
          ) : null}
          {f.ultimo_envio && (
            <span className="text-xs text-slate-500">
              {f.ultimo_envio.tipo === 'factura' ? 'Factura enviada' : 'Recordatorio enviado'} {haceDias(f.ultimo_envio.enviado_en)}
              {f.ultimo_envio.modo === 'prueba' && ' (prueba)'}
            </span>
          )}
        </div>
      </Link>
      <div className="flex gap-2 shrink-0">
        {vencida ? (
          <Boton variante="secundario" icono={<BellRing className="size-4" />} onClick={() => setRecordar(f)}>Recordar</Boton>
        ) : (
          <Boton variante="secundario" icono={<Send className="size-4" />} onClick={() => setEnviar(f)}>Enviar</Boton>
        )}
        <Boton variante="secundario" icono={<CheckCircle2 className="size-4 text-emerald-600" />} onClick={() => cobrada.mutate(f.id)}>Cobrada</Boton>
      </div>
    </li>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cobros</h1>
          <p className="text-slate-500 mt-1">Lo que te deben, a quién reclamar y los recordatorios que salen solos.</p>
        </div>

        <AvisoRebotes />

        <div className="grid grid-cols-3 gap-3">
          <Cifra texto="Por cobrar" valor={euros(suma(r.facturas))} />
          <Cifra texto="Vencido" valor={euros(suma(vencidas))} alerta={vencidas.length > 0} />
          <Cifra texto="Clientes con retrasos" valor={clientesVencidos} alerta={clientesVencidos > 0} />
        </div>

        {!r.correo_configurado && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <p><b>Modo prueba:</b> los correos se apuntan pero todavía no salen. Para enviarlos de verdad hay que poner los datos del correo de la empresa (SMTP) en el servidor.</p>
          </div>
        )}

        <Tarjeta titulo={`Vencidas (${vencidas.length})`}>
          {vencidas.length === 0 ? <p className="text-sm text-slate-500">Ningún cliente se ha retrasado. 👍</p> : (
            <ul className="-my-3 divide-y divide-slate-100">{vencidas.map((f: any) => filaFactura(f, true))}</ul>
          )}
        </Tarjeta>

        <Tarjeta titulo={`Por vencer (${porVencer.length})`}>
          {porVencer.length === 0 ? <p className="text-sm text-slate-500">No hay facturas pendientes que aún estén en plazo.</p> : (
            <ul className="-my-3 divide-y divide-slate-100">{porVencer.map((f: any) => filaFactura(f, false))}</ul>
          )}
        </Tarjeta>

        <HistorialEnvios />

        <AjustesRecordatorios ajustes={r.ajustes} />
      </div>

      {recordar && <PanelRecordatorio factura={recordar} onCerrar={() => setRecordar(null)} />}
      {enviar && <PanelEnviarFactura facturaId={enviar.id} onCerrar={() => setEnviar(null)} />}
    </div>
  );
}

const horaEnvio = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Estado que nos cuenta Resend después de enviar; «enviado» es que aún no ha avisado */
const ESTADO_ENVIO: Record<string, [string, 'verde' | 'naranja' | 'rojo']> = {
  entregado: ['Entregado', 'verde'],
  retrasado: ['Retrasado', 'naranja'],
  rebotado: ['No ha llegado', 'rojo'],
  spam: ['Marcado como spam', 'rojo'],
};

/**
 * Correos que no han llegado al cliente y nadie ha revisado. Sin facturaId salen todos
 * (Inicio y Cobros); con facturaId, solo los de esa factura.
 */
export function AvisoRebotes({ facturaId, onReenviar }: { facturaId?: string; onReenviar?: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data } = useQuery({ queryKey: ['cobros', 'rebotes'], queryFn: () => api<any[]>('/cobros/rebotes') });
  const revisado = useMutation({
    mutationFn: (id: string) => api(`/cobros/envios/${id}/revisado`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cobros'] }),
    onError: (e: Error) => avisar(e.message, true),
  });
  const lista = (data ?? []).filter((e) => !facturaId || e.factura?.id === facturaId);
  if (!lista.length) return null;
  return (
    <div className="no-imprimir mb-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-4 shrink-0" />
        {lista.length === 1 ? 'Un correo no ha llegado al cliente' : `${lista.length} correos no han llegado a los clientes`}
      </p>
      <ul className="mt-2 space-y-2">
        {lista.map((e) => (
          <li key={e.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="break-words">
                {!facturaId && e.factura && (
                  <Link to={`/facturas/${e.factura.id}`} className="font-semibold underline">
                    {e.factura.numero ? `Factura ${e.factura.numero}` : 'Prefactura'} · {e.factura.cliente?.nombre}
                  </Link>
                )}
                {!facturaId && ' · '}
                {e.estado === 'spam' ? 'Marcado como spam por ' : 'Enviado a '}
                <b>{e.para}</b> el {horaEnvio(e.enviado_en)}
              </p>
              {e.motivo && <p className="text-xs text-red-700">{e.motivo}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              {e.factura?.cliente?.id && (
                <Link to={`/clientes/${e.factura.cliente.id}`} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-red-800 border border-red-200 hover:bg-red-100">
                  Corregir email
                </Link>
              )}
              {onReenviar && (
                <button onClick={onReenviar} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-red-800 border border-red-200 hover:bg-red-100">
                  Volver a enviar
                </button>
              )}
              <button onClick={() => revisado.mutate(e.id)} disabled={revisado.isPending} className="rounded-full px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100">
                Ya está revisado
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Una línea del historial: qué se mandó, a quién y cuándo */
function FilaEnvio({ e, conFactura, prefactura }: { e: any; conFactura?: boolean; prefactura?: boolean }) {
  const recordatorio = e.tipo === 'recordatorio';
  const doc = e.factura ? (e.factura.numero ? `Factura ${e.factura.numero}` : `Prefactura${e.factura.periodo ? ` de ${nombreMes(e.factura.periodo)}` : ''}`) : '';
  const titulo = recordatorio ? 'Recordatorio de pago' : prefactura || e.factura?.numero === null ? 'Prefactura enviada' : 'Factura enviada';
  return (
    <li className="py-3 flex items-start gap-3">
      <span className={cx('mt-0.5 rounded-full p-2 shrink-0', recordatorio ? 'bg-amber-50 text-amber-700' : 'bg-marca-50 text-marca-700')}>
        {recordatorio ? <BellRing className="size-4" /> : <Mail className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        {conFactura && e.factura ? (
          <Link to={`/facturas/${e.factura.id}`} className="block truncate font-semibold hover:underline">
            {doc} · {e.factura.cliente?.nombre}
          </Link>
        ) : (
          <p className="truncate font-semibold">{titulo}</p>
        )}
        <p className="truncate text-sm text-slate-500">
          {conFactura ? `${recordatorio ? 'Recordatorio' : 'Enviada'} a ` : 'A '}
          {e.para}
          {conFactura && e.factura && ` · ${euros(e.factura.total)}`}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">{horaEnvio(e.enviado_en)}</span>
          {e.automatico && <Etiqueta color="azul">Automático</Etiqueta>}
          {e.modo === 'prueba' && <Etiqueta color="naranja">No salió (modo prueba)</Etiqueta>}
          {e.modo !== 'prueba' && ESTADO_ENVIO[e.estado] && <Etiqueta color={ESTADO_ENVIO[e.estado][1]}>{ESTADO_ENVIO[e.estado][0]}</Etiqueta>}
        </div>
        {e.motivo && <p className={cx('mt-1 text-xs', e.estado === 'retrasado' ? 'text-amber-700' : 'text-red-700')}>{e.motivo}</p>}
      </div>
    </li>
  );
}

/** Todos los correos que han salido desde la app, con buscador */
function HistorialEnvios() {
  const { data, isLoading } = useQuery({ queryKey: ['cobros', 'envios'], queryFn: () => api<any[]>('/cobros/envios') });
  const [q, setQ] = useState('');
  const [todos, setTodos] = useState(false);
  const texto = q.trim().toLowerCase();
  const lista = (data ?? []).filter(
    (e) =>
      !texto ||
      [e.para, e.asunto, e.factura?.numero, e.factura?.cliente?.nombre].some((x) => String(x ?? '').toLowerCase().includes(texto)),
  );
  const visibles = todos || texto ? lista : lista.slice(0, 8);

  return (
    <Tarjeta titulo="Historial de envíos">
      {isLoading ? (
        <Cargando />
      ) : !data?.length ? (
        <Vacio icono={<History className="size-7" />} titulo="Aún no has enviado nada" texto="Aquí verás cada factura y recordatorio que mandes por correo: a quién, cuándo y si fue automático." />
      ) : (
        <div className="space-y-2">
          <Entrada placeholder="Buscar por cliente, factura o correo" value={q} onChange={(e) => setQ(e.target.value)} />
          {visibles.length === 0 ? (
            <p className="py-3 text-sm text-slate-500">Nada coincide con «{q}».</p>
          ) : (
            <ul className="divide-y divide-slate-100">{visibles.map((e) => <FilaEnvio key={e.id} e={e} conFactura />)}</ul>
          )}
          {!todos && !texto && lista.length > visibles.length && (
            <div className="flex justify-center pt-1">
              <Boton variante="secundario" onClick={() => setTodos(true)}>Ver los {lista.length} envíos</Boton>
            </div>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

/** Envíos de una factura, para su ficha */
export function EnviosFactura({ facturaId, prefactura }: { facturaId: string; prefactura?: boolean }) {
  const { data } = useQuery({ queryKey: ['cobros', 'envios', facturaId], queryFn: () => api<any[]>(`/cobros/envios/${facturaId}`) });
  if (!data?.length) return null;
  return (
    <Tarjeta titulo={`Envíos (${data.length})`} className="no-imprimir mt-4">
      <ul className="-my-3 divide-y divide-slate-100">{data.map((e) => <FilaEnvio key={e.id} e={e} prefactura={prefactura} />)}</ul>
    </Tarjeta>
  );
}

/** Panel lateral con los envíos de una factura (desde «Más» en su ficha) */
export function PanelHistorialEnvios({ facturaId, prefactura, onCerrar }: { facturaId: string; prefactura?: boolean; onCerrar: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['cobros', 'envios', facturaId], queryFn: () => api<any[]>(`/cobros/envios/${facturaId}`) });
  return (
    <Panel abierto onCerrar={onCerrar} titulo="Historial de envíos">
      {isLoading ? (
        <Cargando />
      ) : !data?.length ? (
        <Vacio icono={<History className="size-7" />} titulo="Aún no se ha enviado" texto="Cuando la envíes por correo o mandes un recordatorio, aparecerá aquí a quién y cuándo." />
      ) : (
        <ul className="-my-3 divide-y divide-slate-100">{data.map((e) => <FilaEnvio key={e.id} e={e} prefactura={prefactura} />)}</ul>
      )}
    </Panel>
  );
}

function AjustesRecordatorios({ ajustes }: { ajustes: any }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [v, setV] = useState(ajustes);
  useEffect(() => setV(ajustes), [ajustes]);
  const guardar = useMutation({
    mutationFn: () => api('/cobros/ajustes', { method: 'PUT', body: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cobros'] }); avisar('Recordatorios guardados'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Tarjeta titulo="Recordatorios automáticos">
      <div className="space-y-4">
        <Interruptor
          activo={v.recordatorios_auto}
          onChange={(x) => setV({ ...v, recordatorios_auto: x })}
          etiqueta="Avisar solos a los clientes que se retrasen"
          ayuda="Cada mañana a las 9 se envía un recordatorio a quien tenga una factura vencida, si tiene correo en su ficha."
        />
        {v.recordatorios_auto && (
          <>
            <Campo etiqueta="Repetir el aviso cada">
              <Selector value={v.cada_dias} onChange={(e) => setV({ ...v, cada_dias: Number(e.target.value) })}>
                {[3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} días</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Texto del recordatorio" ayuda="{numero}, {total}, {vencimiento}, {iban}, {cliente} y {empresa} se cambian solos por sus datos">
              <AreaTexto rows={9} value={v.texto_recordatorio} onChange={(e) => setV({ ...v, texto_recordatorio: e.target.value })} />
            </Campo>
          </>
        )}
        <div className="flex justify-end">
          <Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton>
        </div>
      </div>
    </Tarjeta>
  );
}

function PanelRecordatorio({ factura, onCerrar }: { factura: any; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [v, setV] = useState({ para: '', mensaje: '' });
  const { data, isLoading } = useQuery({ queryKey: ['recordatorio', factura.id], queryFn: () => api(`/cobros/recordatorio/${factura.id}`) });
  useEffect(() => { if (data) setV(data); }, [data]);

  const enviar = useMutation({
    mutationFn: () => api('/cobros/recordatorio', { method: 'POST', body: { factura_id: factura.id, ...v } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['cobros'] });
      avisar(r.modo === 'prueba' ? 'Recordatorio apuntado (modo prueba, no ha salido)' : 'Recordatorio enviado');
      onCerrar();
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={`Recordar factura ${factura.numero}`}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton icono={<Mail className="size-4" />} onClick={() => enviar.mutate()} cargando={enviar.isPending}>Enviar recordatorio</Boton></>}
    >
      {isLoading ? <Cargando /> : (
        <div className="space-y-4">
          <Campo etiqueta="Para" ayuda={!data?.para ? 'Este cliente no tiene correo en su ficha: escríbelo aquí.' : undefined}>
            <Entrada type="email" value={v.para} onChange={(e) => setV({ ...v, para: e.target.value })} placeholder="administracion@cliente.es" />
          </Campo>
          <Campo etiqueta="Mensaje">
            <AreaTexto rows={11} value={v.mensaje} onChange={(e) => setV({ ...v, mensaje: e.target.value })} />
          </Campo>
        </div>
      )}
    </Panel>
  );
}

/** Texto que se propone al enviar una factura o prefactura: cercano, y se puede cambiar antes de enviar */
/** Envía la factura en PDF por email. Se usa desde Cobros y desde el detalle de la factura. */
export function PanelEnviarFactura({ facturaId, onCerrar }: { facturaId: string; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { data: f, isLoading } = useQuery({ queryKey: ['factura', facturaId], queryFn: () => api(`/facturas/${facturaId}`) });
  const [v, setV] = useState({ para: '', asunto: '', mensaje: '' });

  useEffect(() => {
    if (!f) return;
    setV({
      para: f.cliente?.email ?? '',
      asunto: asuntoFactura(f),
      mensaje: mensajeFactura(f),
    });
  }, [f]);

  const enviar = useMutation({
    mutationFn: async () => {
      const { crearPdfFactura } = await import('../components/FacturaPdf');
      const pdf = await crearPdfFactura(f);
      return api('/cobros/enviar-factura', {
        method: 'POST',
        body: { factura_id: f.id, ...v, pdf: await aBase64(pdf), nombre_pdf: pdf.name },
      });
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['cobros'] });
      avisar(r.modo === 'prueba' ? 'Envío apuntado (modo prueba, no ha salido)' : 'Factura enviada');
      onCerrar();
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={f ? (f.numero ? `Enviar factura ${f.numero}` : 'Enviar prefactura') : 'Enviar factura'}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton icono={<Send className="size-4" />} onClick={() => enviar.mutate()} cargando={enviar.isPending} disabled={!f}>Enviar con el PDF</Boton></>}
    >
      {isLoading || !f ? <Cargando /> : (
        <div className="space-y-4">
          <Campo etiqueta="Para" ayuda={!f.cliente?.email ? 'Este cliente no tiene correo en su ficha: escríbelo aquí.' : undefined}>
            <Entrada type="email" value={v.para} onChange={(e) => setV({ ...v, para: e.target.value })} placeholder="administracion@cliente.es" />
          </Campo>
          <Campo etiqueta="Asunto"><Entrada value={v.asunto} onChange={(e) => setV({ ...v, asunto: e.target.value })} /></Campo>
          <Campo etiqueta="Mensaje"><AreaTexto rows={7} value={v.mensaje} onChange={(e) => setV({ ...v, mensaje: e.target.value })} /></Campo>
          <p className="text-sm text-slate-500">Se adjunta la factura en PDF.</p>
        </div>
      )}
    </Panel>
  );
}

const Cifra = ({ texto, valor, alerta }: { texto: string; valor: React.ReactNode; alerta?: boolean }) => (
  <div className={cx('rounded-2xl p-3 md:p-4 border', alerta ? 'bg-red-50 border-red-100' : 'bg-white border-slate-200/70')}>
    <p className={cx('text-xs md:text-sm', alerta ? 'text-red-700' : 'text-slate-500')}>{texto}</p>
    <p className={cx('text-base md:text-xl font-bold mt-1', alerta && 'text-red-700')}>{valor}</p>
  </div>
);
