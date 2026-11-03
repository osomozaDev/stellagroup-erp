import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, FileText, Pencil, Plus, Receipt, Target, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { euros, fechaCorta, hoyISO } from '../lib/formato';
import { AreaTexto, Boton, Campo, Confirmar, Entrada, Etiqueta, Panel, Tarjeta, cx, useAviso, useFormulario } from './ui';

/**
 * Hitos de un proyecto por hitos: cada entrega con su importe. Al entregarla se
 * marca y se factura (o se prepara una prefactura para que el cliente la revise).
 */
export default function Hitos({ proyecto }: { proyecto: any }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [editando, setEditando] = useState<any | null>(null);
  const [facturando, setFacturando] = useState<any | null>(null);
  const [borrando, setBorrando] = useState<any | null>(null);
  const hitos: any[] = proyecto.hitos ?? [];
  const suma = hitos.reduce((t, h) => t + Number(h.importe), 0);
  const presupuesto = Number(proyecto.presupuesto);
  const ruta = `/proyectos/${proyecto.id}/hitos`;

  const completar = useMutation({
    mutationFn: (h: any) => api(`${ruta}/${h.id}/completado`, { method: 'PATCH', body: { completado: !h.completado_en } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proyecto', proyecto.id] }),
    onError: (e: Error) => avisar(e.message, true),
  });

  const borrar = useMutation({
    mutationFn: (h: any) => api(`${ruta}/${h.id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries(); avisar('Hito borrado'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  const facturada = (h: any) => h.factura && h.factura.estado !== 'anulada';

  return (
    <Tarjeta
      titulo="Hitos"
      accion={<Boton variante="fantasma" icono={<Plus className="size-4" />} onClick={() => setEditando({})}>Añadir hito</Boton>}
    >
      {!hitos.length ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Target className="size-8 text-marca-500 shrink-0" />
          <p className="flex-1 text-sm text-slate-600">
            Reparte el presupuesto en entregas (diseño, desarrollo, puesta en marcha…). Cuando entregues cada una, la facturas con un clic.
          </p>
          <Boton variante="secundario" icono={<Plus className="size-4" />} onClick={() => setEditando({})}>Primer hito</Boton>
        </div>
      ) : (
        <>
          <ul className="-my-2 divide-y divide-slate-100">
            {hitos.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-3">
                <button
                  onClick={() => !facturada(h) && completar.mutate(h)}
                  disabled={facturada(h)}
                  aria-label={h.completado_en ? 'Marcar como pendiente' : 'Marcar como entregado'}
                  className={cx(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition',
                    h.completado_en ? 'border-marca-600 bg-marca-600 text-white' : 'border-slate-300 hover:border-marca-500',
                  )}
                >
                  {h.completado_en && <Check className="size-3.5" strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={cx('text-sm font-medium', h.completado_en && 'text-slate-500')}>{h.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {h.completado_en ? `Entregado el ${fechaCorta(h.completado_en)}` : h.fecha_prevista ? `Previsto para el ${fechaCorta(h.fecha_prevista)}` : 'Sin fecha'}
                  </p>
                </div>
                {facturada(h) ? (
                  <Link to={`/facturas/${h.factura.id}`}>
                    <Etiqueta color={h.factura.estado === 'cobrada' ? 'verde' : h.factura.estado === 'borrador' ? 'gris' : 'azul'}>
                      {h.factura.estado === 'borrador' ? 'Prefactura' : h.factura.estado === 'cobrada' ? 'Cobrado' : `Factura ${h.factura.numero}`}
                    </Etiqueta>
                  </Link>
                ) : h.completado_en ? (
                  <Boton variante="secundario" icono={<Receipt className="size-4" />} onClick={() => setFacturando(h)}>Facturar</Boton>
                ) : null}
                <span className="w-24 text-right text-sm font-semibold">{euros(h.importe)}</span>
                <div className="flex">
                  <button onClick={() => setEditando(h)} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Editar hito"><Pencil className="size-4" /></button>
                  {!facturada(h) && (
                    <button onClick={() => setBorrando(h)} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label="Borrar hito"><Trash2 className="size-4" /></button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
            <span className="text-slate-500">Suma de los hitos</span>
            <span className={cx('font-semibold', presupuesto > 0 && Math.abs(suma - presupuesto) > 0.009 && 'text-amber-600')}>
              {euros(suma)}{presupuesto > 0 && Math.abs(suma - presupuesto) > 0.009 && ` de ${euros(presupuesto)} presupuestados`}
            </span>
          </div>
        </>
      )}

      {editando && <FormularioHito proyectoId={proyecto.id} hito={editando.id ? editando : null} onCerrar={() => setEditando(null)} />}
      {facturando && <FacturarHito proyectoId={proyecto.id} hito={facturando} onCerrar={() => setFacturando(null)} />}
      <Confirmar
        abierto={!!borrando}
        titulo="¿Borrar este hito?"
        texto={`Se borrará «${borrando?.nombre ?? ''}».`}
        botonSi="Borrar"
        peligro
        onNo={() => setBorrando(null)}
        onSi={() => { borrar.mutate(borrando); setBorrando(null); }}
      />
    </Tarjeta>
  );
}

function FormularioHito({ proyectoId, hito, onCerrar }: { proyectoId: string; hito: any | null; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const { valores, campo } = useFormulario({
    nombre: hito?.nombre ?? '',
    descripcion: hito?.descripcion ?? '',
    importe: hito?.importe ?? '',
    fecha_prevista: hito?.fecha_prevista ?? '',
  });
  const guardar = useMutation({
    mutationFn: () =>
      hito
        ? api(`/proyectos/${proyectoId}/hitos/${hito.id}`, { method: 'PATCH', body: valores })
        : api(`/proyectos/${proyectoId}/hitos`, { method: 'POST', body: valores }),
    onSuccess: () => { qc.invalidateQueries(); avisar(hito ? 'Hito guardado' : 'Hito añadido'); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });
  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={hito ? 'Editar hito' : 'Nuevo hito'}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton></>}
    >
      <div className="space-y-4">
        <Campo etiqueta="Nombre"><Entrada {...campo('nombre')} placeholder="Diseño y prototipo" autoFocus /></Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Importe € (sin IVA)"><Entrada type="number" inputMode="decimal" step="0.01" {...campo('importe')} /></Campo>
          <Campo etiqueta="Fecha prevista"><Entrada type="date" {...campo('fecha_prevista')} /></Campo>
        </div>
        <Campo etiqueta="Qué incluye" ayuda="Sale debajo del nombre en la factura"><AreaTexto rows={3} {...campo('descripcion')} /></Campo>
      </div>
    </Panel>
  );
}

function FacturarHito({ proyectoId, hito, onCerrar }: { proyectoId: string; hito: any; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [fecha, setFecha] = useState(hoyISO());
  const facturar = useMutation({
    mutationFn: (borrador: boolean) => api<any>(`/proyectos/${proyectoId}/hitos/${hito.id}/facturar`, { method: 'POST', body: { fecha, borrador } }),
    onSuccess: (f, borrador) => { qc.invalidateQueries(); avisar(borrador ? 'Prefactura preparada' : `Factura ${f.numero} emitida`); onCerrar(); },
    onError: (e: Error) => avisar(e.message, true),
  });
  return (
    <Panel
      abierto
      onCerrar={onCerrar}
      titulo={`Facturar «${hito.nombre}»`}
      pie={
        <>
          <Boton variante="secundario" icono={<FileText className="size-4" />} onClick={() => facturar.mutate(true)} disabled={facturar.isPending}>Solo prefactura</Boton>
          <Boton icono={<Receipt className="size-4" />} onClick={() => facturar.mutate(false)} cargando={facturar.isPending}>Emitir factura</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Se hace una factura de <b>{euros(hito.importe)}</b> + IVA con este hito. Si prefieres que el cliente la revise antes, prepara solo la prefactura: no gasta número.
        </p>
        <Campo etiqueta="Fecha de la factura"><Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
      </div>
    </Panel>
  );
}
