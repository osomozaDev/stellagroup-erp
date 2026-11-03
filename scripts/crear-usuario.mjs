// Crea un usuario ADMINISTRADOR para entrar en Stella ERP (el resto se crean desde la web, en Usuarios).
//   pnpm crear-usuario correo@empresa.es            → base de datos local
//   pnpm crear-usuario correo@empresa.es --prod     → base de datos real (PROD_* en .env)
// La contraseña se pide al ejecutarlo y no se ve al escribirla (así no queda en el historial).
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const args = process.argv.slice(2);
const prod = args.includes('--prod');
const [email, passwordArg] = args.filter((a) => a !== '--prod');
if (!email) {
  console.error('Uso: pnpm crear-usuario correo@empresa.es [--prod]');
  process.exit(1);
}

const url = prod ? env.PROD_SUPABASE_URL : env.SUPABASE_URL;
const clave = prod ? env.PROD_SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error(`Faltan ${prod ? 'PROD_SUPABASE_URL / PROD_SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'} en .env`);
  process.exit(1);
}

/** Pide la contraseña sin mostrarla en pantalla */
function pedirContrasena() {
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.includes('Contraseña') ? s : '');
    rl.question('Contraseña (mínimo 8 caracteres): ', (r) => {
      rl.close();
      process.stdout.write('\n');
      ok(r);
    });
  });
}

/** Pide la contraseña dos veces: al no verse, es fácil equivocarse al escribirla */
async function pedirDosVeces() {
  const primera = await pedirContrasena();
  process.stdout.write('Repite la contraseña. ');
  const segunda = await pedirContrasena();
  if (primera !== segunda) {
    console.error('Las dos contraseñas no coinciden. Vuelve a ejecutarlo.');
    process.exit(1);
  }
  return primera;
}

const password = passwordArg ?? (await pedirDosVeces());
if (password.length < 8) {
  console.error('La contraseña tiene que tener al menos 8 caracteres');
  process.exit(1);
}

const db = createClient(url, clave);
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error('No se pudo crear:', error.message);
  process.exit(1);
}
// Sin perfil no se puede entrar: desde aquí siempre se crea un administrador
const { data: rol } = await db.from('roles').select('id').eq('tipo', 'admin').limit(1).single();
const { error: errorPerfil } = await db.from('perfiles').insert({ usuario_id: data.user.id, rol_id: rol?.id });
if (errorPerfil) {
  await db.auth.admin.deleteUser(data.user.id);
  console.error('No se pudo darle el rol de administrador:', errorPerfil.message);
  process.exit(1);
}
console.log(`Administrador ${email} creado en ${prod ? 'PRODUCCIÓN' : 'local'}`);
