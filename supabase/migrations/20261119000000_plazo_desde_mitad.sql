-- El plazo de entrega se cuenta desde que el Cliente ha pagado al menos la mitad del precio
-- cerrado (la web, sin las cuotas), no desde el primer pago, que puede ser menor.
update plantillas_contrato
set cuerpo = replace(
  cuerpo,
  'contados desde la recepción del primer pago y de ',
  'contados desde que el Cliente haya abonado al menos el 50 % del precio cerrado y desde la recepción de '
)
where position('contados desde la recepción del primer pago y de ' in cuerpo) > 0;
