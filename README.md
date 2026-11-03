# Stella ERP

ERP sencillo para **Stella Group**, una empresa de software a medida, páginas web y servicios digitales (automatización, integraciones, IA y SEO técnico). Pocas pantallas, palabras claras y botones grandes. Se ve bien en el móvil y en el ordenador.

Parte de la misma base que ObraFácil (el ERP de Heras Perea), adaptada de obras de construcción a proyectos de una agencia digital.

## Qué hace

- **Clientes → Presupuestos → Proyectos → Facturas.**
- **Presupuestos** numerados (`P2026-001`) con sus partidas, PDF, estados *borrador / enviado / aceptado / rechazado* y aviso de los caducados. Al aceptarlo se crea el proyecto con **un hito por partida**.
- **Proyectos** de dos tipos:
  - **Por hitos** (precio cerrado): cada entrega tiene su importe; al entregarla se marca y se factura con un clic (o se prepara como prefactura).
  - **Por horas** (bolsa de horas, evolución, soporte): horas apuntadas semana a semana y **Facturar el mes**, que crea todas las facturas de una vez y no deja facturar dos veces el mismo mes.
- **Servicios recurrentes**: hosting, dominios, mantenimientos, licencias, SaaS y correo, con precio, coste, margen y periodicidad. **Facturar renovaciones** hace una factura por cliente y avanza la próxima renovación. El inicio y Telegram avisan antes de que renueven.
- **Facturas** con numeración correlativa por serie y año (`F2026-0001`), prefacturas, rectificativas, retención de IRPF opcional, PDF y envío por correo.
- **Cobros**: lo vencido, recordatorios automáticos por correo y aviso de rebotes (Resend).
- **Portal de clientes**: entran con un enlace de un solo uso que les llega al correo y descargan sus facturas en PDF o en ZIP.
- **Bot de Telegram** con miniapp: resumen de cobros, facturas, proyectos con sus hitos, `/renovaciones` y avisos diarios.
- **Equipo y nóminas** (estimación mensual), **Gestoría** (303, 111 y 347 en Excel) y **usuarios con roles y permisos**.
- **Inicio** con lo pendiente: hitos entregados sin facturar, horas del mes, renovaciones en 30 días, presupuestos esperando respuesta, cobros y lo facturado en el año.

## Marca

La app lleva la marca de **Stella Group** (stellagroup.es): nombre y lema en `apps/web/src/marca.ts`, colores `marca-*` en `apps/web/src/index.css` (el azul de la web, `oklch(55% .22 250)` ≈ `#006fea`), tipografías Inter y Space Grotesk, y el monograma «SG» en `apps/web/public/` (`simbolo.png`, `simbolo.svg`, favicon e iconos de móvil). El logo original está en `docs/marca/`. El logo y el color de las facturas se cambian desde «Mi empresa».

## Estructura

```
apps/api         NestJS — la única que habla con la base de datos (service role)
apps/web         React + Vite + Tailwind — interfaz tipo Holded / Gmail
packages/shared  Validaciones (zod) y cálculos de facturas, nóminas y renovaciones, usados por los dos
packages/pdf     Plantilla del PDF de facturas y presupuestos (la usan la web y la API)
supabase/        Migración SQL y datos de ejemplo
```

La web solo usa Supabase para iniciar sesión. Todos los datos pasan por la API, que comprueba el token en cada petición. Las tablas tienen RLS activado sin políticas, así que con la clave pública no se puede leer nada.

## Arrancar en local

Necesitas Node 22+, pnpm, Docker y la CLI de Supabase. Usa sus propios puertos para convivir con ObraFácil: Supabase en **563xx**, API en **3101** y web en **5183**.

```bash
pnpm install
pnpm db:start                 # Supabase local (puertos 563xx) con los datos de ejemplo
cp .env.example .env          # pega las claves que muestra `supabase status`
pnpm crear-usuario demo@stellagroup.test <contraseña>   # o la de DEMO_PASSWORD de .env.example
pnpm dev                      # web en http://localhost:5183, API en :3101
```

`pnpm db:reset` borra la base de datos y carga los datos de ejemplo (`supabase/seed.sql`): cinco clientes, proyectos por hitos y por horas, presupuestos en todos los estados, servicios con renovaciones próximas y facturas de julio a octubre de 2026. Después hay que volver a crear el usuario.

Los datos fiscales de la empresa del ejemplo (CIF, dirección, IBAN) son de relleno: pon los reales en «Mi empresa».

## Producción

Todavía no está publicado. Para hacerlo como ObraFácil:

- **Web y API:** Vercel, con el `vercel.json` de este repositorio. El build (`build:vercel`) empaqueta la API en un único archivo que carga `api/index.mjs`.
- **Base de datos:** un proyecto nuevo de Supabase. Las migraciones se aplican con `supabase link` + `supabase db push`.
- **Variables en Vercel:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `WEB_URL`, `CRON_SECRET`, `ENABLE_EXPERIMENTAL_COREPACK=1`, para enviar correos `SMTP_*` y, para el bot, las de Telegram.
- **Recordatorios y avisos:** Vercel Cron llama cada día a `/api/cron/recordatorios`.
- **Usuarios:** el registro libre está desactivado; se crean con `pnpm crear-usuario correo@empresa.es --prod`.
