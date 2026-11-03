import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Boton, Campo, Entrada } from '../components/ui';
import Marca from '../components/Marca';

/** aviso: por qué no se ha podido entrar solo desde Telegram */
export default function Entrar({ aviso }: { aviso?: string | null }) {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
    if (error) setError('El correo o la contraseña no son correctos');
    setCargando(false);
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-3xl bg-white p-6 md:p-8 shadow-xl shadow-slate-200/60 border border-slate-100">
        <Marca grande className="mb-8" />
        <h1 className="text-xl font-bold tracking-tight">Hola de nuevo</h1>
        <p className="text-slate-500 mt-1 mb-6">Entra para gestionar tus proyectos y facturas.</p>
        {aviso && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{aviso}</p>}
        <div className="space-y-4">
          <Campo etiqueta="Correo">
            <Entrada type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@empresa.es" />
          </Campo>
          <Campo etiqueta="Contraseña">
            <Entrada type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
          </Campo>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Boton type="submit" className="w-full h-12" cargando={cargando}>Entrar</Boton>
        </div>
      </form>
    </div>
  );
}
