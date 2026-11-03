import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, ChevronDown, FileText, LogOut, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { euros, fecha, nombreMes } from '../lib/formato';
import { Cargando, Etiqueta, Tarjeta, cx } from '../components/ui';
import Marca from '../components/Marca';

/** Lo que ve un trabajador: su proyecto y sus nóminas. Nada más. */
export default function Portal() {
  const { data, isLoading } = useQuery({ queryKey: ['yo'], queryFn: () => api('/yo') });
  const [abierta, setAbierta] = useState<string | null>(null);
  if (isLoading || !data) return <Cargando />;
  const e = data.empleado;

  return (
    <div className="min-h-full bg-fondo">
      <header className="flex items-center justify-between bg-white border-b border-slate-100 px-4 h-16">
        <Marca />
        <button onClick={() => supabase.auth.signOut()} className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
          <LogOut className="size-4" /> Salir
        </button>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4 pb-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hola, {e.nombre}</h1>
          <p className="text-slate-500">{e.puesto ?? 'Equipo de proyecto'} · {data.empresa}</p>
        </div>

        <Tarjeta titulo="Tu proyecto">
          {e.proyecto ? (
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-marca-600"><FolderKanban className="size-5" /></span>
              <div>
                <p className="font-semibold">{e.proyecto.nombre}</p>
                <p className="text-sm text-slate-500">{e.proyecto.cliente?.nombre}</p>
                {e.proyecto.url && <a href={e.proyecto.url} target="_blank" rel="noreferrer" className="text-sm text-marca-600 hover:underline break-all">{e.proyecto.url.replace(/^https?:\/\//, '')}</a>}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Ahora mismo no tienes ningún proyecto asignado.</p>
          )}
        </Tarjeta>

        <Tarjeta titulo="Tus nóminas">
          {data.nominas.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay nóminas.</p>
          ) : (
            <ul className="-my-1 divide-y divide-slate-100">
              {data.nominas.map((n: any) => {
                const pagada = n.estado === 'pagada';
                const ver = abierta === n.id;
                return (
                  <li key={n.id}>
                    <button onClick={() => setAbierta(ver ? null : n.id)} className="flex w-full items-center gap-3 py-3 text-left">
                      <Wallet className="size-5 shrink-0 text-slate-400" />
                      <span className="flex-1 font-medium capitalize">{nombreMes(n.periodo)}</span>
                      <Etiqueta color={pagada ? 'verde' : 'naranja'}>{pagada ? 'Pagada' : 'Pendiente'}</Etiqueta>
                      <span className="w-24 text-right font-bold">{euros(n.neto)}</span>
                      <ChevronDown className={cx('size-4 text-slate-400 transition', ver && 'rotate-180')} />
                    </button>
                    {ver && (
                      <dl className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                        <dt className="text-slate-500">Bruto</dt><dd className="text-right">{euros(n.bruto)}</dd>
                        <dt className="text-slate-500">IRPF</dt><dd className="text-right">− {euros(n.irpf)}</dd>
                        <dt className="text-slate-500">Seguridad Social</dt><dd className="text-right">− {euros(n.ss_trabajador)}</dd>
                        <dt className="font-semibold">Neto</dt><dd className="text-right font-semibold">{euros(n.neto)}</dd>
                        {pagada && n.pagada_en && <><dt className="text-slate-500">Pagada el</dt><dd className="text-right">{fecha(n.pagada_en)}</dd></>}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">Son importes orientativos. La nómina oficial es la que te entrega la gestoría.</p>
        </Tarjeta>
      </main>
    </div>
  );
}
