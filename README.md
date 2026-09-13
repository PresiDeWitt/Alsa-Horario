# Horario — cuadrante rotativo ALSA

Una sola pantalla: el calendario, mes tras mes, con los descansos en amarillo y la hora de cada servicio bajo el día. Arriba, fijo, lo de hoy. Es una web app instalable (PWA): en el móvil se guarda con el icono **Horario** y abre sin conexión.

## Ver el entorno local

Doble clic en `servir.cmd`, o en una terminal dentro de la carpeta:

```bash
python tools/serve.py
```

y abre <http://localhost:4173/preview.html>: la app dentro de un móvil (iPhone o Android) y el mock del botón «Horario» junto al Wi‑Fi. La app sola está en <http://localhost:4173/index.html>.

## Dos horarios en un calendario

Además del cuadrante de ALSA, el calendario lleva el horario de Mercadona para ver qué días libran los dos:

- **Mercadona** tiene un día libre a la semana que **avanza un día cada semana** (martes, luego miércoles, luego jueves…), los domingos siempre libre, y el turno se alterna: una semana **mañanas (6:00–14:30)** y la siguiente **tardes (13:30–22:00)**.
- En cada día del calendario, bajo la hora de ALSA, aparece **M** (mañanas), **T** (tardes) o **libre** en verde. Los días en que libran los dos tienen el fondo verde, y la cabecera indica el próximo.
- **Ajustes → Mercadona**: se elige una semana de referencia, qué día se libra esa semana y qué turno toca; el resto se calcula. También si los domingos son libres y si se alternan los turnos, y los horarios.
- **Vacaciones o cambios sueltos**: tocar el día → *Marcar vacaciones en Mercadona* (o *Marcar que trabajas este día*).

## Cómo se usa

- **Arriba**: la fecha, el servicio de hoy (o *Descanso*) y cuándo es el próximo descanso o el próximo servicio.
- **El calendario**: se desplaza sin fin hacia delante y hacia atrás. Cada mes indica cuántos servicios y descansos tiene. Los descansos son círculos amarillos; bajo cada día de trabajo, la hora en azul (Sevilla) o rojo (Cartagena). Hoy lleva un anillo.
- **Un día**: al tocarlo se abre su detalle (ALSA: lugar, hora, servicio, turno; Mercadona: turno y horario) y la semana completa de los dos.
- **Hoy**: si te alejas, aparece un botón para volver.
- **Ajustes** (engranaje): el turno de esta semana, el cuadrante editable (un bloque por turno, un día por línea), el aspecto (automático, claro, oscuro), el acceso de este dispositivo y cómo instalarla.

## Privacidad: solo los dispositivos que tú quieras

El cuadrante no está en claro en internet: `js/data.js` lo lleva **cifrado** (PBKDF2 + AES‑256‑GCM) y la
app solo lo abre con la **clave de acceso**. Quien no la tenga ve una pantalla de bloqueo y nada más.

- **Dar acceso a un dispositivo**: abrir la app en él y escribir la clave (da igual mayúsculas, guiones o espacios). Queda autorizado para siempre
  (se guarda en ese dispositivo) y funciona sin conexión.
- **Quitar el acceso a un dispositivo que tienes en la mano**: Ajustes → *Quitar el acceso en este dispositivo*.
- **Dejar fuera a un dispositivo que no tienes**: cambiar la clave. En este PC:

  ```bash
  node tools/cifrar.js --nueva
  ```

  muestra la clave nueva y vuelve a cifrar. Después publica con `node tools/publicar.js "Nueva clave"`.
  Todos los dispositivos pedirán la clave nueva; escríbela solo en los que quieras conservar.
- **Cambiar el cuadrante para todos los dispositivos**: editar `cuadrante.json` (solo existe en este PC, no
  se sube), ejecutar `node tools/cifrar.js` con la clave actual y publicar con `node tools/publicar.js "Cuadrante nuevo"`. Los dispositivos
  que no hayan editado su cuadrante adoptan el nuevo al abrir la app.

- **Contra la fuerza bruta**: la clave generada tiene 20 caracteres (unos 98 bits): no se puede adivinar
  probando, ni descargando el fichero cifrado. Cada intento cuesta además 600 000 iteraciones de PBKDF2.
  En el propio dispositivo, tras 3 fallos hay esperas crecientes (30 s, 1, 2, 4… min, hasta 1 h) y al
  duodécimo fallo el dispositivo queda bloqueado 24 h. Si te la inventas tú (`--clave`), mínimo 16 caracteres.

La clave actual está en `clave.txt` (solo en este PC). Ni `clave.txt` ni `cuadrante.json` entran en el repositorio.

## Publicar cambios

Un solo comando, desde la carpeta del proyecto:

```bash
node tools/publicar.js "qué has cambiado"
```

Sube el número de versión (`version.json`), lo pone en las direcciones de los ficheros para que ningún
navegador mezcle versiones antiguas y nuevas (GitHub Pages cachea 10 minutos), y hace commit y push.
En medio minuto está en la web. La app, si detecta ficheros de versiones distintas, se recarga sola.

## Cómo funciona la rotación

- `cuadrante.json` contiene el cuadrante: 8 filas (turnos) × 7 días. Cada celda es `"Lugar hora - servicio"` o `"DESCANSO"`. `js/data.js` es su versión cifrada.
- Cada semana natural (lunes a domingo) corresponde a un turno; la siguiente pasa al turno siguiente y tras el 8 vuelve al 1.
- En **Ajustes → Turno de esta semana** se fija el turno que toca ahora; a partir de ahí se calcula todo el pasado y el futuro.
- Los cambios del cuadrante y el turno se guardan en el navegador (`localStorage`).

## Ponerla en el móvil

La app necesita estar publicada en una dirección `https` (GitHub Pages, Netlify, Cloudflare Pages… son ficheros estáticos). Después:

- **Android (Chrome)**: menú ⋮ → *Instalar aplicación*. Icono «Horario» en la pantalla de inicio.
- **iPhone (Safari)**: Compartir → *Añadir a pantalla de inicio*. Para el Centro de control (iOS 18 o superior): un atajo que abra Horario, añadido como control *Atajo*.

El botón dentro de los *Ajustes rápidos* de Android y el control del Centro de control de iPhone solo los puede ofrecer una app instalada de verdad. El código de ambos, con el icono en monocromo, está en [`native/`](native/README.md), listo para una app envoltorio (Capacitor) que cargue esta misma web. En `preview.html` se ve cómo quedan.

## Icono

Un autobús de frente con los faros amarillos (el amarillo de los descansos). `icons/favicon.svg` es la versión a color, `icons/tile.svg` la monocroma para el botón, y `python tools/make-icons.py` regenera los PNG.

## Ficheros

```
index.html            la app
css/styles.css        estilos (claro y oscuro)
js/data.js            cuadrante cifrado (generado por tools/cifrar.js)
js/app.js             cálculo de turnos, calendario, detalle, ajustes
manifest.webmanifest  datos de instalación (nombre, iconos, color)
sw.js                 cache para abrir sin conexión
icons/                iconos (regenerar con `python tools/make-icons.py`)
native/               botón de accesos rápidos: TileService (Android) y ControlWidget (iOS)
preview.html          entorno local: móvil + mock del botón
servir.cmd            arranca el servidor local y abre la vista previa
tools/serve.py        servidor estático (respeta la variable PORT, sin cache)
tools/cifrar.js       cifra cuadrante.json en js/data.js con la clave de acceso
tools/publicar.js     versiona los ficheros y publica (commit + push)
version.json          número de versión publicada
cuadrante.json        cuadrante en claro (solo en este PC)
clave.txt             clave de acceso actual (solo en este PC)
```
