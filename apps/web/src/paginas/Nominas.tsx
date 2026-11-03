import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Info, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { euros, mesActual, moverMes, nombreCompleto, nombreMes } from '../lib/formato';
import { Avatar, Boton, Cargando, Etiqueta, Vacio, cx, useAviso } from '../components/ui';

export default function Nominas() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [mes, setMes] = useState(mesActual());
  const { data: nominas, isLoading } = useQuery({ queryKey: ['nominas', mes], queryFn: () => api<any[]>(`/nominas?periodo=${mes}`) });

  const generar = useMutation({
    mutationFn: () => api('/nominas/generar', { method: 'POST', body: { periodo: mes } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries();
      avisar(r.creadas ? `${r.creadas} nóminas preparadas` : 'Todas las nóminas del mes ya estaban hechas');
    },
    onError: (e: Error) => avisar(e.message, true),
  });
  const cambiar = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) => api(`/nominas/${id}/estado`, { method: 'PATCH', body: { estado } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nominas'] }),
    onError: (e: Error) => avisar(e.message, true),
  });

  const lista = nominas ?? [];
  const suma = (k: string) => lista.reduce((s, n) => s + Number(n[k]), 0);
  const pagadas = lista.filter((n) => n.estado === 'pagada').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Nóminas</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setMes(moverMes(mes, -1))} className="rounded-full bg-slate-100 p-2.5 hover:bg-slate-200" aria-label="Mes anterior"><ChevronLeft className="size-4" /></button>
            <span className="min-w-36 text-center font-semibold capitalize">{nombreMes(`${mes}-01`)}</span>
            <button onClick={() => setMes(moverMes(mes, 1))} className="rounded-full bg-slate-100 p-2.5 hover:bg-slate-200" aria-label="Mes siguiente"><ChevronRight className="size-4" /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Cifra texto="A pagar (neto)" valor={euros(suma('neto'))} />
          <Cifra texto="IRPF a Hacienda" valor={euros(suma('irpf'))} />
          <Cifra texto="Seguridad Social" valor={euros(suma('ss_trabajador') + suma('ss_empresa'))} />
          <Cifra texto="Coste total empresa" valor={euros(suma('coste_empresa'))} destacado />
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <Info className="size-4 mt-0.5 shrink-0" />
          <p>Son cálculos aproximados para saber cuánto pagar y cuánto cuesta cada persona. La nómina oficial la sigue haciendo tu gestoría. Los porcentajes se cambian en <Link to="/ajustes" className="text-marca-600 font-medium">Mi empresa</Link>.</p>
        </div>

        {isLoading ? <Cargando /> : lista.length === 0 ? (
          <Vacio
            icono={<Wallet className="size-7" />}
            titulo={`Sin nóminas de ${nombreMes(`${mes}-01`)}`}
            texto="Prepáralas con un clic a partir del sueldo de cada empleado en plantilla."
            accion={<Boton onClick={() => generar.mutate()} cargando={generar.isPending}>Preparar nóminas del mes</Boton>}
          />
        ) : (
          <div className="rounded-2xl border border-slate-200/70 bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
              <p className="text-sm text-slate-600">{pagadas} de {lista.length} pagadas</p>
              <Boton variante="secundario" onClick={() => generar.mutate()} cargando={generar.isPending}>Añadir las que falten</Boton>
            </div>
            <ul className="divide-y divide-slate-100">
              {lista.map((n) => {
                const pagada = n.estado === 'pagada';
                return (
                  <li key={n.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar texto={nombreCompleto(n.empleado)} />
                    <Link to={`/empleados/${n.empleado.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{nombreCompleto(n.empleado)}</p>
                      <p className="truncate text-xs text-slate-500">Bruto {euros(n.bruto)} · coste {euros(n.coste_empresa)}</p>
                    </Link>
                    <div className="text-right">
                      <p className="font-bold">{euros(n.neto)}</p>
                      <Etiqueta color={pagada ? 'verde' : 'naranja'}>{pagada ? 'Pagada' : 'Pendiente'}</Etiqueta>
                    </div>
                    <button
                      onClick={() => cambiar.mutate({ id: n.id, estado: pagada ? 'pendiente' : 'pagada' })}
                      className={cx('flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition', pagada ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-400 hover:text-emerald-400')}
                      aria-label={pagada ? 'Marcar como pendiente' : 'Marcar como pagada'}
                    >
                      <Check className="size-5" strokeWidth={3} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const Cifra = ({ texto, valor, destacado }: { texto: string; valor: string; destacado?: boolean }) => (
  <div className={cx('rounded-2xl p-4 border', destacado ? 'bg-marca-600 border-marca-600 text-white' : 'bg-white border-slate-200/70')}>
    <p className={cx('text-sm', destacado ? 'text-marca-100' : 'text-slate-500')}>{texto}</p>
    <p className="text-lg md:text-xl font-bold mt-1">{valor}</p>
  </div>
);
