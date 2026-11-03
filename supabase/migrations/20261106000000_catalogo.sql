-- Catálogo de productos y servicios con su precio, para añadirlos de un clic a los presupuestos.
-- Al usarlo se copia el concepto y el precio en la línea: cambiar el catálogo no toca los presupuestos ya hechos.
create table catalogo (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'servicio' check (tipo in ('servicio', 'producto')),
  nombre text not null,
  descripcion text,                            -- sale debajo del nombre en el presupuesto
  categoria text,
  unidad text not null default 'ud',
  precio numeric(12,2) not null default 0,     -- sin IVA
  coste numeric(12,2),                         -- lo que nos cuesta (para saber el margen); no sale en el presupuesto
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index catalogo_nombre_idx on catalogo(activo, categoria, nombre);

alter table catalogo enable row level security;
grant all on catalogo to service_role;
