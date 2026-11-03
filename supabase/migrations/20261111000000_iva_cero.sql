-- El IVA por defecto pasa a ser el 0 %: el habitual de la empresa y el de partida en lo nuevo
alter table empresa alter column iva_pct set default 0;
alter table proyectos alter column iva_pct set default 0;
alter table facturas alter column iva_pct set default 0;
alter table presupuestos alter column iva_pct set default 0;
alter table servicios alter column iva_pct set default 0;
update empresa set iva_pct = 0;
