import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { euros, MESES, mesActual, moverMes, nombreMes, num } from '../lib/formato';
import { Entrada, Tarjeta, cx, useAviso } from './ui';

type Semana = { inicio: string; fin: string; horas: number | null; notas: string | null; actualizado: string | null };

/** '2026-10-05', '2026-10-11' → '5 – 11 oct' */
const comoTexto = (h: number | null) => (h == null ? '' : String(h).replace('.', ','));

const rango = (inicio: string, fin: string) => {
  const [d1, d2] = [Number(inicio.slice(8)), Number(fin.slice(8))];
  const mes = MESES[Number(inicio.slice(5, 7)) - 1].slice(0, 3);
  return d1 === d2 ? `${d1} ${mes}` : `${d1} – ${d2} ${mes}`;
};

/**
 * Horas trabajadas en el proyecto semana a semana. Al facturar el mes se propone la
 * suma de las semanas apuntadas en vez de las horas habituales del proyecto.
 */
export default function HorasSemanales({ proyecto }: { proyecto: any }) {
  const [mes, setMes] = useState(mesActual());
  const { data } = useQuery({
    queryKey: ['horas-proyecto', proyecto.id, mes],
    queryFn: () => api<{ semanas: Semana[]; total: number }>(`/proyectos/${proyecto.id}/horas?mes=${mes}`),
  });
  const apuntadas = data?.semanas.filter((s) => s.horas != null).length ?? 0;
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <Tarjeta
      titulo="Horas por semana"
      accion={
        <div className="flex items-center gap-1">
          <button onClick={() => setMes(moverMes(mes, -1))} className="rounded-full p-2 hover:bg-slate-100" aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </button>
          <span className="w-36 text-center text-sm font-semibold capitalize whitespace-nowrap">{nombreMes(`${mes}-01`)}</span>
          <button onClick={() => setMes(moverMes(mes, 1))} className="rounded-full p-2 hover:bg-slate-100" aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </button>
        </div>
      }
    >
      {!data ? (
        <div className="h-48" />
      ) : (
        <>
          <ul className="-mt-1 divide-y divide-slate-100">
            {data.semanas.map((s) => (
              <FilaSemana key={s.inicio} proyectoId={proyecto.id} mes={mes} semana={s} actual={s.inicio <= hoy && hoy <= s.fin} />
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-sm text-slate-600">
              Total del mes <b className="text-slate-900 text-base">{num(data.total)} h</b>
              {Number(proyecto.precio_hora) > 0 && <> × {euros(proyecto.precio_hora)} = <b className="text-slate-900">{euros(data.total * Number(proyecto.precio_hora))}</b></>}
            </p>
            <p className="text-xs text-slate-500">
              {apuntadas === 0
                ? `Sin apuntar: al facturar se usarán las ${num(proyecto.horas_mes)} h habituales`
                : apuntadas < data.semanas.length
                  ? `${apuntadas} de ${data.semanas.length} semanas apuntadas`
                  : 'Todas las semanas apuntadas'}
            </p>
          </div>
          {apuntadas > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Al <Link to="/facturar-mes" className="underline">facturar el mes</Link> se propondrán estas {num(data.total)} h.
            </p>
          )}
        </>
      )}
    </Tarjeta>
  );
}

function FilaSemana({ proyectoId, mes, semana, actual }: { proyectoId: string; mes: string; semana: Semana; actual: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [valor, setValor] = useState(comoTexto(semana.horas));
  const [guardado, setGuardado] = useState(false);
  useEffect(() => setValor(comoTexto(semana.horas)), [semana.horas]);

  const guardar = useMutation({
    mutationFn: (horas: number | null) =>
      horas == null
        ? api(`/proyectos/${proyectoId}/horas/${semana.inicio}`, { method: 'DELETE' })
        : api(`/proyectos/${proyectoId}/horas/${semana.inicio}`, { method: 'PUT', body: { horas, notas: semana.notas } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['horas-proyecto', proyectoId, mes] });
      qc.invalidateQueries({ queryKey: ['pendientes-mes'] });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 1500);
    },
    onError: (e: Error) => {
      avisar(e.message, true);
      setValor(comoTexto(semana.horas));
    },
  });

  const alSalir = () => {
    const texto = valor.trim().replace(',', '.');
    const horas = texto === '' ? null : Number(texto);
    if (horas != null && (Number.isNaN(horas) || horas < 0)) {
      setValor(comoTexto(semana.horas));
      return;
    }
    if (horas === semana.horas) return;
    guardar.mutate(horas);
  };

  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className={cx('text-sm font-medium', actual && 'text-marca-700')}>{rango(semana.inicio, semana.fin)}</p>
        {actual && <p className="text-xs text-marca-600">Esta semana</p>}
      </div>
      <span className="w-5 flex justify-center">{guardado && <Check className="size-4 text-emerald-600" />}</span>
      <label className="relative w-28">
        <Entrada
          type="text"
          inputMode="decimal"
          placeholder="—"
          value={valor}
          disabled={guardar.isPending}
          onChange={(e) => setValor(e.target.value)}
          onBlur={alSalir}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="pr-8 text-right"
          aria-label={`Horas de ${rango(semana.inicio, semana.fin)}`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">h</span>
      </label>
    </li>
  );
}
