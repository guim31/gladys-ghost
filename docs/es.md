# Ghost

[Ghost](https://ghost.org/) es una plataforma de publicación libre (MIT) para
blogs y newsletters, autoalojada o en Ghost(Pro). Esta integración lleva las
cifras de su blog a Gladys: sus miembros (gratuitos, de pago, nuevos), sus
artículos (publicados, borradores, programados, el último) y los suscriptores
de cada newsletter. Las escenas pueden reaccionar a un nuevo miembro o a un
nuevo artículo, un widget del panel muestra el blog de un vistazo, y una acción
de escena pone sus cifras en un mensaje.

Probada con un Ghost 6.77 real autoalojado (Docker, SQLite); todavía no en
Ghost(Pro), y los miembros de pago no se han podido probar (sin cuenta de
Stripe): sus comentarios son bienvenidos en
[las issues](https://github.com/guim31/gladys-ghost/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un blog Ghost, versión 5 o 6, autoalojado o en Ghost(Pro), accesible desde
  la máquina de Gladys.
- La **clave Admin API** de una integración personalizada (la crea un
  propietario o administrador del blog). La clave lee todo el blog: la
  integración solo lee, nunca escribe.

En cada actualización la integración envía nueve peticiones a Ghost, sea cual
sea el tamaño del blog (los recuentos salen de los totales de la API, un
miembro o artículo por petición). Ghost no publica ninguna cuota para la API
Admin; cada 5 minutos por defecto queda muy por debajo de lo que soporta un
blog.

## Primeros pasos

### 1. Crear una integración personalizada en Ghost

1. En el admin de Ghost, abra **Settings → Integrations** (sección
   «Advanced»).
2. **Add custom integration**, llámela «Gladys» y luego **Create**.
3. Copie la **Admin API key** (tiene la forma `6a1b…:9f3c…`, un identificador,
   dos puntos y un secreto largo). No la clave Content API: no puede leer los
   miembros.

### 2. Configurar la integración

1. En Gladys, **Integraciones → Ghost → Configuración**.
2. **Dirección del blog**: la dirección de su sitio, por ejemplo
   `https://blog.example.org` (una dirección copiada del admin,
   `…/ghost/#/dashboard`, también sirve). Un Ghost local:
   `http://192.168.1.10:2368`. Si el admin de su blog tiene su propio dominio,
   use ese.
3. **Clave Admin API**: pegue la clave.
4. **Intervalo de actualización**: 1, 5 (por defecto), 15 o 30 minutos.
   También es el retraso de las escenas.
5. **Idioma de los nombres**: idioma de los nombres de funciones, las fechas y
   las frases de escena (francés por defecto).
6. Guarde y luego **Probar la conexión**: la respuesta da la versión de Ghost,
   los miembros y los artículos publicados.

### 3. Añadir los dispositivos

Abra la pestaña **Descubrir**: el blog, sus miembros, sus artículos y cada
newsletter activa se proponen como dispositivos. Añada los que quiera.

## Los dispositivos

El blog (con su título como nombre):

- **En línea**: 1 cuando Ghost responde, 0 si no.
- **Versión de Ghost**: por ejemplo `6.77`.

«Miembros»:

- **Miembros**, **Miembros gratuitos**, **Miembros de pago** (planes de
  cortesía incluidos).
- **Nuevos miembros (24 h)** y **Nuevos miembros (7 días)**: miembros que se
  unieron en las últimas 24 horas, los últimos 7 días.

«Artículos»:

- **Artículos publicados**, **Borradores**, **Artículos programados**.
- **Último artículo**: el título del último artículo publicado, y **Fecha del
  último artículo**: su fecha, en la zona horaria de Gladys.

«Newsletter …», una por newsletter activa: **Suscriptores**.

Los valores solo se envían a Gladys cuando cambian (y al menos cada 12 horas),
con historial para los contadores.

## Panel

El widget **Blog Ghost** muestra cuatro mosaicos (miembros, de pago, nuevos en
7 días, artículos), el último artículo con su fecha y un botón **Actualizar**
que vuelve a leer Ghost en el acto. El último artículo y el botón se pueden
ocultar en los ajustes del widget. Cuando Ghost no responde, el widget indica
el motivo bajo las últimas cifras leídas.

## Escenas

### Disparadores

- **Nuevo miembro**: alguien se hace miembro del blog. Puede limitarlo a un
  plan (gratuito, de pago, cortesía). La escena puede usar el nombre y el
  correo del miembro, su plan y el nombre del blog.
- **Artículo publicado**: se publica un artículo, al momento o a la hora
  programada. La escena puede usar el título y la dirección del artículo.

Ambos se detectan en la siguiente lectura de Ghost (el intervalo de
actualización). La primera lectura solo registra lo existente; lo que llegó
mientras la integración estaba detenida se anuncia al reiniciarse.

### Acciones

- **Leer las cifras del blog**: vuelve a leer miembros y artículos (si la
  última lectura tiene más de 15 segundos) y los pasa a las siguientes
  acciones, con una frase lista: «Mi blog: 132 miembro(s), 12 de pago, 3
  nuevo(s) en 24 h, 9 en 7 días, último artículo «Hola» el 15/11/26, 21:22.»

### Ideas de escenas

- Una notificación «Nuevo miembro: {{name}}» con **Nuevo miembro**, solo para
  los de pago.
- Cada lunes a las 8:00, **Leer las cifras del blog** y enviar la frase a su
  teléfono.
- Cuando **En línea** se queda en 0 durante 10 minutos, una notificación: el
  blog está caído.

## Solución de problemas

- **«Ghost no responde»**: compruebe la dirección y que la máquina de Gladys
  puede alcanzarla.
- **«clave Admin API rechazada»**: la integración personalizada se eliminó o
  su clave se regeneró: copie de nuevo la clave.
- **«No es una clave Admin API»**: ha copiado la clave Content API.
- **«no hay ningún blog Ghost en esta dirección»**: compruebe la dirección; un
  Ghost en un subdirectorio (`https://example.org/blog`) lo necesita.
- **«la dirección redirige a otro sitio»**: introduzca la dirección del admin
  de Ghost (la de su navegador cuando inicia sesión en Ghost).
- **«certificado rechazado»**: no se acepta un certificado autofirmado: use la
  dirección `http://` de su red.
- Los registros de la integración (**Integraciones → Ghost**) dan más
  detalles; no se escribe nada en ellos durante un ciclo de lectura normal.

## Límites

- Solo lectura: la integración no cambia nada en Ghost.
- Un blog por integración.
- «Miembros de pago» son todos los miembros menos los gratuitos: planes de pago
  y de cortesía juntos.
- Un artículo publicado con una fecha pasada (antedatado) no activa **Artículo
  publicado**. Como máximo se anuncian 20 nuevos miembros y 10 nuevos
  artículos por lectura.
- Todavía no probada en Ghost(Pro) ni con Stripe, y sin relación con la Ghost
  Foundation.
