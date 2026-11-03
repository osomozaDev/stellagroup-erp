-- Presupuestos para alguien que aún no es cliente: los datos van en texto libre
-- (nombre, CIF, dirección…, una cosa por línea). Al aceptarlo se da de alta el cliente.
alter table presupuestos alter column cliente_id drop not null;
alter table presupuestos add column cliente_texto text;
alter table presupuestos add constraint presupuestos_con_cliente
  check (cliente_id is not null or nullif(trim(cliente_texto), '') is not null);
