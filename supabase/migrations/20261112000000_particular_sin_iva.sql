-- Mientras no haya sociedad, los presupuestos y contratos los firma una persona física, sin alta
-- de autónomo y sin IVA: en Mi empresa van su nombre y su DNI, y los PDF dicen «DNI» en vez de «CIF».

-- Sin IVA, las condiciones de los presupuestos nuevos no lo mencionan
update empresa set condiciones_presupuesto = nullif(trim(regexp_replace(condiciones_presupuesto, 'Precios sin IVA\.?\s*', '', 'g')), '')
where condiciones_presupuesto ~ 'Precios sin IVA';

-- Plantilla de servicios web para particular, sin IVA y sin precio por hora.
-- Pasa a ser la de por defecto: la de la S.L. se desactiva
-- y se vuelve a activar desde Contratos › Plantillas cuando se firme la sociedad.
insert into plantillas_contrato (nombre, descripcion, cuerpo)
select 'Contrato de servicios web (particular, sin IVA)',
       'Para contratar como particular mientras no haya sociedad. Sin IVA. Usa el presupuesto como Anexo I.',
$$# Contrato de prestación de servicios de diseño, desarrollo y mantenimiento web

En {fecha.ciudad}, a {fecha.larga}.

## Reunidos

De una parte, **{empresa.nombre}**, mayor de edad, con DNI {empresa.cif}, domicilio en {empresa.direccion_completa} y teléfono {empresa.telefono}, que actúa en su propio nombre y derecho (en adelante, «el Prestador»).

De otra parte, **{cliente.nombre}**, con NIF/CIF {cliente.cif}, domicilio en {cliente.direccion_completa}, teléfono {cliente.telefono} y correo {cliente.email}, y en su nombre la persona que firma este contrato (en adelante, «el Cliente»).

El Cliente declara que contrata estos servicios para su actividad empresarial o profesional, y no como consumidor.

Ambas partes se reconocen capacidad legal suficiente para obligarse y

## Exponen

I. Que el Prestador se dedica al diseño, desarrollo, posicionamiento y mantenimiento de páginas web y servicios digitales para negocios.

II. Que el Cliente desea contratar dichos servicios conforme al presupuesto nº {presupuesto.numero} de {presupuesto.fecha}, aceptado por el Cliente, que se incorpora como Anexo I y forma parte inseparable de este contrato.

Por todo ello, acuerdan formalizar el presente contrato con arreglo a las siguientes

## Cláusulas

## 1. Objeto

El Prestador diseñará, desarrollará y publicará el sitio web del Cliente y prestará los servicios descritos en el Anexo I, con el alcance (número de páginas, funciones y rondas de revisión), precio y periodicidad que allí se indican. Si hubiera diferencias entre este contrato y el Anexo I en cuanto a alcance o precio, prevalecerá el Anexo I.

Salvo que el Anexo I diga otra cosa, la web incluye diseño adaptado a móvil, tableta y ordenador; elementos de contacto (WhatsApp, llamada, formulario, mapa y redes sociales); configuración inicial de SEO, AEO y GEO; optimización de la velocidad de carga, y la puesta en marcha y publicación del sitio.

Si el Cliente no dispone de textos, logotipo o fotografías, el Prestador podrá redactar los textos, diseñar el logotipo o realizar las fotografías, en los términos y con el precio que figuren en el Anexo I.

## 2. Servicios no incluidos

Salvo que figuren expresamente en el Anexo I, no están incluidos: páginas o secciones adicionales, tienda online o pasarela de pago, reservas con desarrollo a medida, integraciones con sistemas externos, traducciones, campañas de publicidad, la redacción de los textos legales de la web (aviso legal, privacidad y cookies) ni funcionalidades no descritas. Cualquiera de ellos podrá presupuestarse aparte.

## 3. Precio y forma de pago

El precio de cada servicio es el indicado en el Anexo I, que es el importe final que abonará el Cliente. Los trabajos de pago único se abonarán según la forma de pago elegida en el presupuesto:

{presupuesto.plazos}

Los servicios periódicos se abonarán por adelantado, mensual o anualmente según figure en el Anexo I, dentro de los {empresa.dias_pago} días siguientes al inicio de cada periodo.

Todos los pagos se harán por transferencia bancaria a la siguiente cuenta, indicando en el concepto el número del presupuesto. El Prestador entregará al Cliente un recibo de cada pago.

**Cuenta para los pagos:** {empresa.iban} · Titular: {empresa.nombre}

El retraso en el pago devengará el interés legal del dinero desde la fecha en que debió pagarse. Además, el Prestador podrá suspender los trabajos o los servicios contratados, previo aviso al Cliente, hasta que se regularice.

Los precios de los servicios periódicos podrán actualizarse una vez al año, avisando al Cliente con al menos treinta (30) días de antelación; si no está de acuerdo, podrá darse de baja antes de que se apliquen.

## 4. Plazo de entrega

El plazo estimado de entrega es de [falta plazo de entrega en días] días naturales, contados desde la recepción del primer pago y de los contenidos que deba aportar el Cliente (textos, imágenes, logotipo y datos del negocio que no elabore el Prestador). Los retrasos en la entrega de contenidos o en las respuestas del Cliente ampliarán el plazo en el mismo tiempo.

Si transcurren noventa (90) días sin que el Cliente aporte los contenidos o responda, el Prestador le requerirá por escrito para que lo haga en quince (15) días. Si no lo hace, el Prestador podrá dar por finalizado el proyecto, conservando el primer pago en compensación por el trabajo realizado.

## 5. Obligaciones del Cliente

- Facilitar contenidos veraces y de los que posea los derechos de uso, eximiendo al Prestador de cualquier reclamación de terceros por ellos.
- Revisar las propuestas y comunicar sus cambios en un plazo máximo de siete (7) días naturales.
- Custodiar las claves de acceso que reciba.
- Realizar los pagos en los plazos acordados.

## 6. Revisiones, entrega y aceptación

El precio incluye las rondas de revisión indicadas en el Anexo I sobre el diseño propuesto. Los cambios adicionales, o los que supongan modificar lo ya aprobado, se presupuestarán aparte.

Una vez comunicada la entrega, el Cliente dispondrá de siete (7) días naturales para revisarla. Transcurrido dicho plazo sin comunicación, o una vez publicada la web a petición del Cliente, el trabajo se entenderá aceptado.

Mientras el Cliente tenga contratado el mantenimiento, el Prestador corregirá sin coste los errores de funcionamiento de la web en cualquier momento. Si no lo tiene contratado, corregirá sin coste los que el Cliente le comunique dentro de esos siete (7) días; los posteriores se presupuestarán aparte.

## 7. Mantenimiento y alojamiento

Si el Cliente contrata un plan de mantenimiento, su precio y periodicidad (mensual, o anual en un solo pago) son los del Anexo I, y empieza a contar desde la publicación de la web. Se renovará automáticamente por periodos iguales salvo que cualquiera de las partes comunique su baja con al menos treinta (30) días de antelación al siguiente periodo. Si se paga por años, el Cliente podrá darse de baja en cualquier momento, pero no se le devolverá ninguna parte del año ya pagado, salvo que la baja se deba a un incumplimiento del Prestador.

El mantenimiento incluye la modificación de textos e imágenes de las páginas existentes. No incluye nuevas páginas, rediseños ni nuevas funcionalidades, que se presupuestarán aparte. El alojamiento (hosting) está incluido solo mientras el mantenimiento esté activo.

Si el Cliente no contrata mantenimiento o lo da de baja, será responsable de su propio alojamiento. A petición suya, y estando al corriente de pago, el Prestador le entregará en un plazo de quince (15) días una copia completa de los archivos y la base de datos de la web en un formato estándar, junto con los datos necesarios para trasladar el dominio.

## 8. Dominio

El dominio se registrará a nombre del Cliente, que será su titular. Su coste es el indicado en el Anexo I y se renovará anualmente mientras el Cliente no indique lo contrario. El Prestador no responde de la pérdida del dominio si no puede renovarlo por falta de pago o porque el Cliente así lo indique.

## 9. Servicios QR

Los servicios QR contratados en el Anexo I se abonan por adelantado, por meses o por años según figure en él. Los mensuales no tienen permanencia: el Cliente podrá darlos de baja con quince (15) días de antelación al siguiente mes. Los anuales se contratan por un año completo: el Cliente podrá darlos de baja en cualquier momento, pero no se le devolverá ninguna parte del año ya pagado, salvo que la baja se deba a un incumplimiento del Prestador. Tras la baja, los códigos QR, también los ya impresos, y sus contenidos dejarán de estar operativos.

## 10. Propiedad intelectual

Una vez abonado el precio total, el Prestador cede al Cliente, con carácter **no exclusivo**, para todo el mundo y por todo el tiempo de protección, los derechos de reproducción, distribución, comunicación pública y transformación del diseño y los contenidos creados específicamente para su web, para su uso en la actividad del Cliente. Hasta entonces, el Cliente solo dispone de una licencia de uso.

El Prestador conserva la titularidad de sus herramientas, código genérico, plantillas y conocimientos previos, sobre los que el Cliente recibe una licencia de uso indefinida para su web. Los componentes de terceros (plantillas, plugins, tipografías e imágenes de bancos) se rigen por sus propias licencias. El Prestador podrá mostrar el proyecto en su portafolio salvo que el Cliente se oponga por escrito.

## 11. Posicionamiento en buscadores e inteligencia artificial

El Prestador aplicará las buenas prácticas de optimización para buscadores y asistentes de inteligencia artificial. No obstante, los resultados dependen de terceros (Google, ChatGPT y otros) y de la competencia, por lo que no se garantiza una posición concreta ni la aparición en un asistente determinado.

## 12. Confidencialidad

Las partes se comprometen a no divulgar la información confidencial de la otra parte a la que tengan acceso con motivo de este contrato, obligación que se mantendrá durante tres (3) años tras su finalización. Las claves de acceso facilitadas se usarán únicamente para prestar los servicios contratados.

## 13. Protección de datos

Los datos personales de las personas firmantes y de contacto se tratarán por cada parte con la única finalidad de gestionar este contrato, con base en su ejecución y conforme al Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018 (LOPDGDD). Se conservarán mientras dure la relación y los plazos legales de prescripción, y podrán ejercerse los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad dirigiéndose a cada parte por los datos de contacto indicados en este contrato.

Cuando, para prestar los servicios, el Prestador trate datos personales de los que el Cliente es responsable, lo hará como encargado del tratamiento en los términos del Anexo II.

## 14. Equipo del proyecto

El Prestador realiza los trabajos junto con el siguiente equipo:

- **Desarrollo:** el propio Prestador y **Omar Somoza**, que se encargan del diseño, el desarrollo y el mantenimiento de la web.
- **Comercial:** **Paola González**, que atiende al Cliente, prepara el presupuesto y le acompaña durante el proyecto.

El proyecto es común a los tres, pero el Prestador firma este contrato como su único titular: es el único responsable frente al Cliente del trabajo realizado y el único destinatario de los pagos, y Omar Somoza y Paola González no son parte de este contrato. Todos ellos quedan sujetos a las mismas obligaciones de confidencialidad y protección de datos que este contrato establece.

Cualquier petición, cambio o nuevo servicio que el Cliente quiera contratar podrá solicitarlo a Paola González, en el teléfono 610 436 323.

## 15. Responsabilidad y fuerza mayor

El Prestador no será responsable de interrupciones o daños causados por terceros proveedores (alojamiento, dominio, plataformas externas), ataques informáticos ajenos a su control, ni por el uso indebido de la web o de las claves por parte del Cliente. Tampoco responderá del lucro cesante ni de daños indirectos. En todo caso, su responsabilidad se limitará al importe abonado por el Cliente en los doce (12) meses anteriores al hecho causante, salvo dolo o negligencia grave.

Ninguna de las partes responderá de los incumplimientos debidos a causas de fuerza mayor o ajenas a su control razonable, como caídas generales de proveedores de internet o alojamiento, ciberataques masivos o desastres naturales, mientras duren.

## 16. Duración y resolución

Este contrato entra en vigor en la fecha de su firma y se mantendrá hasta la entrega de la web y, en cuanto a los servicios periódicos, mientras sigan contratados. Cualquiera de las partes podrá resolverlo por incumplimiento de la otra si este no se subsana en quince (15) días desde su notificación por escrito.

Si el Cliente cancela el proyecto antes de la entrega, deberá abonar el trabajo realizado hasta ese momento, con un mínimo equivalente al primer pago. Al terminar el contrato por cualquier causa, el Cliente abonará lo pendiente y el Prestador le entregará los materiales pagados.

## 17. Comunicaciones

Las comunicaciones entre las partes podrán realizarse por WhatsApp, teléfono o correo electrónico a los datos indicados en este contrato, que tendrán plena validez a efectos de aprobaciones, entregas y avisos. Las peticiones de cambios y de nuevos servicios podrán dirigirse también a Paola González, en el teléfono 610 436 323, como se indica en la cláusula 14.

## 18. Legislación y jurisdicción

Este contrato se rige por la legislación española. Para cualquier controversia, las partes se someten a los Juzgados y Tribunales de {empresa.ciudad}, salvo que la normativa aplicable establezca un fuero imperativo distinto.

Y en prueba de conformidad, ambas partes firman el presente contrato electrónicamente o, en su caso, por duplicado, en el lugar y fecha indicados en el encabezamiento.

## Anexo I · Servicios contratados y precios

Según el presupuesto nº {presupuesto.numero} de {presupuesto.fecha}.

{presupuesto.partidas}

## Anexo II · Encargo del tratamiento de datos (art. 28 RGPD)

- **Objeto y duración:** el Prestador trata datos personales por cuenta del Cliente solo para prestar los servicios de este contrato (alojamiento y mantenimiento de la web, gestión de formularios y servicios QR) y mientras estén contratados.
- **Datos y personas afectadas:** datos de contacto e identificativos de los clientes, usuarios de la web y participantes en la fidelización del Cliente, y los que el Cliente incorpore a la web.
- **Instrucciones:** el Prestador tratará los datos solo siguiendo las instrucciones documentadas del Cliente y no los usará para fines propios.
- **Confidencialidad:** las personas autorizadas por el Prestador para tratar los datos se comprometen a mantener su confidencialidad.
- **Seguridad:** el Prestador aplicará medidas técnicas y organizativas adecuadas al riesgo (cifrado SSL, copias de seguridad, control de accesos y actualizaciones de seguridad).
- **Subencargados:** el Cliente autoriza al Prestador a recurrir a sus proveedores de alojamiento, correo y plataformas QR, sujetos a las mismas obligaciones. El Prestador informará al Cliente de cualquier cambio de proveedor, que podrá oponerse.
- **Asistencia y brechas:** el Prestador ayudará al Cliente a atender los derechos de las personas afectadas y le notificará sin dilación indebida, y en todo caso en un máximo de 48 horas, cualquier brecha de seguridad de la que tenga conocimiento.
- **Auditoría:** el Prestador pondrá a disposición del Cliente la información necesaria para demostrar el cumplimiento de estas obligaciones.
- **Fin del encargo:** al terminar los servicios, el Prestador devolverá los datos al Cliente o los suprimirá, según indique, salvo obligación legal de conservarlos.
- **Responsabilidad del Cliente:** el Cliente es el responsable del tratamiento, y le corresponde informar a las personas afectadas y obtener su consentimiento cuando sea necesario, incluidos los textos legales y el aviso de cookies de su web.
$$
where not exists (select 1 from plantillas_contrato where nombre = 'Contrato de servicios web (particular, sin IVA)');

update plantillas_contrato set activa = false
where nombre = 'Contrato de servicios web (diseño, desarrollo y mantenimiento)';
