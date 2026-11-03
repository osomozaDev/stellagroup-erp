import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Send } from 'lucide-react';
import { api } from '../lib/api';
import { Boton, Cargando, Interruptor, Tarjeta, useAviso } from './ui';

interface Estado {
  configurado: boolean;
  bot: string | null;
  conectado: boolean;
  nombre: string | null;
  avisos: string[];
  tipos: { clave: string; nombre: string; descripcion: string }[];
}

/** Cada usuario conecta su propio Telegram y elige qué avisos le llegan */
export default function AvisosTelegram() {
  const qc = useQueryClient();
  const avisar = useAviso();
  // Mientras se espera a que pulse «Iniciar» en Telegram, se pregunta cada pocos segundos
  const [enlace, setEnlace] = useState<string | null>(null);
  const esperando = !!enlace;
  const { data, isLoading } = useQuery({
    queryKey: ['telegram'],
    queryFn: () => api<Estado>('/telegram'),
    refetchInterval: (q) => (esperando && !q.state.data?.conectado ? 3000 : false),
  });
  const refrescar = (e: Estado) => qc.setQueryData(['telegram'], e);

  // La ventana se abre en el mismo clic: abrirla después de esperar a la API la bloquean los navegadores (sobre todo en el iPhone)
  const conectar = useMutation({
    mutationFn: (_ventana: Window | null) => api<{ enlace: string }>('/telegram/conectar', { method: 'POST' }),
    onSuccess: ({ enlace }, ventana) => {
      setEnlace(enlace);
      if (ventana) ventana.location.href = enlace;
    },
    onError: (e: Error, ventana) => { ventana?.close(); avisar(e.message, true); },
  });
  const guardar = useMutation({
    mutationFn: (avisos: string[]) => api<Estado>('/telegram', { method: 'PATCH', body: { avisos } }),
    onSuccess: refrescar,
    onError: (e: Error) => avisar(e.message, true),
  });
  const prueba = useMutation({
    mutationFn: () => api('/telegram/prueba', { method: 'POST' }),
    onSuccess: () => avisar('Mensaje de prueba enviado a tu Telegram'),
    onError: (e: Error) => avisar(e.message, true),
  });
  const desconectar = useMutation({
    mutationFn: () => api('/telegram', { method: 'DELETE' }),
    onSuccess: () => { setEnlace(null); qc.invalidateQueries({ queryKey: ['telegram'] }); avisar('Telegram desconectado'); },
    onError: (e: Error) => avisar(e.message, true),
  });

  return (
    <Tarjeta titulo="Avisos por Telegram">
      {isLoading || !data ? (
        <Cargando />
      ) : !data.configurado ? (
        <p className="text-sm text-slate-500">El bot de Telegram aún no está configurado.</p>
      ) : !data.conectado ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Recibe en el móvil los correos que no llegan, los cobros, las facturas que vencen, el aviso de fin de mes y un resumen cada lunes.
            Cada persona de la oficina conecta su propio Telegram.
          </p>
          {esperando ? (
            <div className="rounded-xl bg-marca-50 px-4 py-3 text-sm text-marca-900">
              <p>
                En Telegram, pulsa <b>Iniciar</b> en el chat de @{data.bot}. Esta pantalla se actualizará sola.
              </p>
              <a href={enlace!} target="_blank" rel="noopener" className="mt-2 inline-flex items-center gap-2 rounded-full bg-marca-600 px-4 py-2 font-semibold text-white">
                <Send className="size-4" /> Abrir Telegram
              </a>
            </div>
          ) : (
            <Boton icono={<Send className="size-4" />} onClick={() => conectar.mutate(window.open('', '_blank'))} cargando={conectar.isPending}>
              Conectar Telegram
            </Boton>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <BellRing className="size-4" /> Conectado{data.nombre ? ` como ${data.nombre}` : ''} con @{data.bot}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.tipos.map((t) => {
              const activo = data.avisos.includes(t.clave);
              return (
                <Interruptor
                  key={t.clave}
                  activo={activo}
                  etiqueta={t.nombre}
                  ayuda={t.descripcion}
                  onChange={(v) => guardar.mutate(v ? [...data.avisos, t.clave] : data.avisos.filter((a) => a !== t.clave))}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton variante="secundario" onClick={() => prueba.mutate()} cargando={prueba.isPending}>Enviar prueba</Boton>
            <Boton variante="secundario" onClick={() => desconectar.mutate()} cargando={desconectar.isPending}>Desconectar</Boton>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}
