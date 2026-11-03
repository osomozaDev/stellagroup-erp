-- Roles de una empresa de software y servicios digitales, con sus permisos de partida.
-- No son de sistema: se pueden renombrar, cambiar de permisos o borrar desde Usuarios → Roles y permisos.
-- (Catálogo y Contratos van con los permisos de Presupuestos y Contratos.)
insert into roles (nombre, tipo, permisos, sistema)
select v.nombre, v.tipo, v.permisos, false
from (values
  ('CEO / Dirección general', 'admin', '{}'::text[]),
  ('Director/a comercial', 'oficina', '{inicio,clientes,presupuestos,contratos,proyectos,servicios,facturas,cobros}'::text[]),
  ('Comercial', 'oficina', '{inicio,clientes,presupuestos,contratos}'::text[]),
  ('Director/a de operaciones', 'oficina', '{inicio,clientes,proyectos,presupuestos,contratos,servicios,empleados}'::text[]),
  ('Jefe/a de proyecto', 'oficina', '{inicio,clientes,proyectos,servicios}'::text[]),
  ('Administración y finanzas', 'oficina', '{inicio,clientes,facturas,cobros,servicios,gestoria,nominas,empleados,empresa}'::text[]),
  ('Recursos humanos', 'oficina', '{inicio,empleados,nominas}'::text[]),
  ('Marketing', 'oficina', '{inicio,clientes,presupuestos}'::text[]),
  ('Soporte técnico', 'oficina', '{inicio,clientes,proyectos,servicios}'::text[])
) as v(nombre, tipo, permisos)
where not exists (select 1 from roles r where r.nombre = v.nombre);
