import { MARCA } from '../marca';
import { cx } from './ui';

/** Logo de la empresa: el monograma y el nombre, como en la cabecera de stellagroup.es */
export default function Marca({ grande, className }: { grande?: boolean; className?: string }) {
  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      <img src={MARCA.simbolo} alt="" className={cx('block w-auto', grande ? 'h-14' : 'h-9 short:h-8')} />
      <span className="leading-none whitespace-nowrap">
        <span className={cx('block font-display font-semibold tracking-tight text-tinta', grande ? 'text-3xl' : 'text-lg')}>{MARCA.nombre}</span>
        {grande && <span className="block text-sm text-slate-500 mt-1.5">{MARCA.lema}</span>}
      </span>
    </span>
  );
}
