import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, UserRound } from 'lucide-react';
import { EnviarComo as Como } from '@stella/shared';
import { api } from '../lib/api';
import { useYo } from '../lib/permisos';
import { Boton, Entrada, cx, useAviso } from './ui';

/**
 * Elegir si un correo sale como la empresa o como quien lo envía. Como usuario, el
 * correo lleva su nombre y las respuestas le llegan a su correo (la dirección de
 * envío sigue siendo la de la empresa). Si aún no ha puesto su nombre, se pone aquí.
 */
export default function EnviarComo({
  valor, empresa, onCambio,
}: { valor: Como; empresa: string; onCambio: (como: Como, nombre: string) => void }) {
  const yo = useYo();
  const qc = useQueryClient();
  const avisar = useAviso();
  const nombre = yo?.nombre ?? yo?.email?.split('@')[0] ?? 'Yo';
  const [editando, setEditando] = useState(false);
  const [nuevo, setNuevo] = useState(nombre);

  const guardar = useMutation({
    mutationFn: () => api<{ nombre: string }>('/yo/nombre', { method: 'PATCH', body: { nombre: nuevo } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['yo'] });
      setEditando(false);
      avisar('Nombre guardado');
      onCambio('usuario', r.nombre);
    },
    onError: (e: Error) => avisar(e.message, true),
  });

  const opcion = (como: Como, icono: React.ReactNode, titulo: string, detalle: string) => (
    <button
      type="button"
      onClick={() => onCambio(como, nombre)}
      className={cx(
        'flex flex-1 items-start gap-2.5 rounded-xl border p-3 text-left transition',
        valor === como ? 'border-marca-500 bg-marca-50 ring-1 ring-marca-500' : 'border-slate-200 bg-white hover:bg-slate-50',
      )}
    >
      <span className={cx('mt-0.5', valor === como ? 'text-marca-600' : 'text-slate-400')}>{icono}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold truncate">{titulo}</span>
        <span className="block text-xs text-slate-500">{detalle}</span>
      </span>
    </button>
  );

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Enviar como</p>
      <div className="flex flex-col sm:flex-row gap-2">
        {opcion('empresa', <Building2 className="size-4" />, empresa, 'Te contestan al correo de la empresa')}
        {opcion('usuario', <UserRound className="size-4" />, `${nombre} · ${empresa}`, `Te contestan a ${yo?.email ?? 'tu correo'}`)}
      </div>
      {valor === 'usuario' && (
        editando ? (
          <div className="flex gap-2">
            <Entrada value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre y apellidos" autoFocus aria-label="Tu nombre" />
            <Boton onClick={() => guardar.mutate()} cargando={guardar.isPending}>Guardar</Boton>
          </div>
        ) : (
          <button type="button" onClick={() => { setNuevo(nombre); setEditando(true); }} className="inline-flex items-center gap-1 text-xs font-medium text-marca-700">
            <Pencil className="size-3" /> {yo?.nombre_propio ? 'Cambiar mi nombre' : `¿No es tu nombre? Escríbelo como quieres que salga`}
          </button>
        )
      )}
    </div>
  );
}
