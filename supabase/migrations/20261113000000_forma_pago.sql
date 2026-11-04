-- Forma de pago de lo que es de pago único, elegida en cada presupuesto: un solo pago,
-- 50 % y 50 % (la de siempre, la de los presupuestos que ya hay) o tres pagos.
alter table presupuestos add column if not exists forma_pago text not null default 'dos'
  check (forma_pago in ('unico', 'dos', 'tres'));
-- Lo nuevo parte del pago único, el único que asegura cobrar todo antes de empezar
alter table presupuestos alter column forma_pago set default 'unico';

-- La forma de pago sale ya de cada presupuesto: se quita de las condiciones de Mi empresa
update empresa set condiciones_presupuesto = nullif(trim(regexp_replace(condiciones_presupuesto, '^\s*Forma de pago:[^\n]*\n?', '', 'gin')), '')
where condiciones_presupuesto ~* 'Forma de pago:';
