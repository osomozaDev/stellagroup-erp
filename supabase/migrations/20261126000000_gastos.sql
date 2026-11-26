-- Gastos de la empresa (material, suscripciones, horas…) y cómo se reparten entre clientes.
-- Un gasto puede ir entero a un cliente, repartirse por porcentaje entre varios o quedarse sin asignar.
create table gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  concepto text not null,
  categoria text not null default 'material' check (categoria in ('material', 'suscripcion', 'horas', 'otro')),
  proveedor text,
  importe numeric(12,2) not null check (importe > 0),
  nota text,
  registrado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index gastos_fecha_idx on gastos(fecha);
alter table gastos enable row level security;

create table gasto_reparto (
  gasto_id uuid not null references gastos(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete restrict,
  porcentaje numeric(6,3) not null check (porcentaje > 0 and porcentaje <= 100),
  primary key (gasto_id, cliente_id)
);
create index gasto_reparto_cliente_idx on gasto_reparto(cliente_id);
alter table gasto_reparto enable row level security;

-- Quien lleva los cobros también lleva los gastos
update roles set permisos = array_append(permisos, 'gastos')
where tipo = 'oficina' and 'cobros' = any(permisos) and not 'gastos' = any(permisos);
update perfiles set permisos = array_append(permisos, 'gastos')
where permisos is not null and 'cobros' = any(permisos) and not 'gastos' = any(permisos);
