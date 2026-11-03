import { bloquesContrato, ParteTexto } from '@stella/shared';
import { cx } from './ui';

const Rico = ({ partes }: { partes: ParteTexto[] }) => (
  <>{partes.map((p, i) => (p.negrita ? <b key={i}>{p.texto}</b> : <span key={i}>{p.texto}</span>))}</>
);

/** Texto del contrato con el mismo formato que el PDF. Lo que falta («[falta …]») sale resaltado. */
export function TextoContrato({ cuerpo, color }: { cuerpo: string; color?: string }) {
  const marcar = (partes: ParteTexto[]) =>
    partes.flatMap((p) => p.texto.split(/(\[falta [^\]]+\])/).filter(Boolean).map((t) => ({ ...p, texto: t, falta: t.startsWith('[falta ') })));
  const Linea = ({ partes }: { partes: ParteTexto[] }) => (
    <>
      {marcar(partes).map((p, i) =>
        p.falta ? <mark key={i} className="rounded bg-amber-100 px-1 text-amber-900">{p.texto}</mark> : <Rico key={i} partes={[p]} />,
      )}
    </>
  );
  return (
    <div className="space-y-2.5 leading-6">
      {bloquesContrato(cuerpo).map((b, i) =>
        b.tipo === 'titulo' ? (
          <h2 key={i} className="text-xl font-bold mb-3"><Linea partes={b.partes} /></h2>
        ) : b.tipo === 'apartado' ? (
          <h3 key={i} className="pt-2 font-semibold" style={{ color }}><Linea partes={b.partes} /></h3>
        ) : b.tipo === 'lista' ? (
          <p key={i} className="pl-5 -indent-3">• <Linea partes={b.partes} /></p>
        ) : (
          <p key={i} className="text-justify"><Linea partes={b.partes} /></p>
        ),
      )}
    </div>
  );
}

/** Vista en pantalla del contrato. Imita el PDF (@stella/pdf). */
export default function ContratoDocumento({ c, className }: { c: any; className?: string }) {
  const e = c.empresa ?? {};
  const color = e.color || '#1f6feb';
  return (
    <div className={cx('@container', className)}>
      <article className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 @2xl:p-10 text-[13px] text-slate-900">
        <header className="flex items-start justify-between gap-4 mb-6">
          <div>
            {e.logo && <img src={e.logo} alt="" className="h-10 max-w-48 object-contain object-left mb-1.5" />}
            <p className="text-sm font-semibold">{e.nombre}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold" style={{ color }}>Contrato</p>
            <p className="text-slate-500">Nº {c.numero}</p>
          </div>
        </header>
        <TextoContrato cuerpo={c.cuerpo ?? ''} color={color} />
      </article>
    </div>
  );
}
