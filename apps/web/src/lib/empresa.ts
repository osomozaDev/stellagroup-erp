import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** En lo nuevo, el IVA de partida es el habitual de «Mi empresa» */
export function useIvaHabitual(nuevo: boolean, poner: (iva: number) => void) {
  const { data: empresa } = useQuery({ queryKey: ['empresa'], queryFn: () => api('/empresa') });
  const iva = empresa?.iva_pct;
  useEffect(() => {
    if (nuevo && iva != null) poner(Number(iva));
  }, [nuevo, iva]);
}
