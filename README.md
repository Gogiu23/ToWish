# ToWish ✦

Lista de deseos y planes **compartida entre grupos pequeños de amigos** (hasta 3 personas por grupo): apuntáis lo que queréis hacer juntos, le ponéis un sitio, lo comentáis, chateáis y lo veis todo en un globo 3D.

**En producción:** https://towish.netlify.app

Hecha con Next.js 16, React 19 y Appwrite. Es una PWA: se instala en el móvil o en el ordenador y avisa de los mensajes con notificaciones push.

---

## Qué hace

### Cuentas y grupos
- **Alta y entrada** con email y contraseña, desde la propia pantalla de inicio (con vídeos de paisajes de fondo que se funden en bucle).
- **Grupos de hasta 3 personas.** Al entrar sin grupo, creas uno (con nombre) o te unes con un **código de invitación** de 6 letras.
- **Invitar** desde la barra lateral: copiar el código (con aviso «¡Código copiado!»), compartir el enlace con el menú del sistema o mandarlo directamente por **WhatsApp**. El enlace (`/?unirse=CÓDIGO`) lleva a darse de alta y te une al grupo al entrar.
- **Varios grupos por persona**, con selector en la barra lateral. Cada grupo solo ve lo suyo: lo garantizan los permisos de Appwrite en el servidor, no la app.
- **Borrar grupo** (solo quien lo creó), con confirmación: se borran sus planes, mensajes y comentarios para todos.
- **Cierre de sesión automático:** tras 5 minutos fuera de la app o 10 minutos sin actividad dentro.
- **Cambiar la contraseña** y **eliminar la cuenta** desde la barra lateral.

### Planes
- Añadir planes en tiempo real (lo que apunta uno aparece al momento en los móviles de los demás).
- **Lugar opcional** en cada plan: buscador con **sugerencias mientras escribes** (calles con número, comercios, sitios) o pegando un **link de Google Maps** (también los cortos `maps.app.goo.gl`). Cada plan con lugar enseña un minimapa que abre la ruta en Google Maps.
- Marcar como hecho, **me gusta** y **comentarios** (cada plan se abre como un «post»; los comentarios también tienen «me gusta» y se pueden editar y borrar).
- **Editar un plan:** cambiar el texto y añadir, cambiar o quitar el lugar y la fecha.
- **Fecha prevista** opcional en cada plan, que se ve en la tarjeta.
- Fecha de cada plan y **cuánto tiempo lleváis deseando hacerlo**.
- **Desliza a la derecha para borrar**, con 5 segundos para deshacer.
- Filtros (todos / pendientes / hechos) y orden (más nuevos o más antiguos primero).
- Tarjetas que se apilan al hacer scroll y título que se encoge en una cabecera pegada (animaciones ligadas al scroll, solo CSS).

### Calendario
- Pestaña con un **calendario mensual** (semana desde el lunes, en el idioma de cada persona): los días con planes llevan un punto rosa (pendiente) o azul (hecho).
- Tocar un día enseña sus planes; los planes **sin fecha** se pueden poner en el día elegido, y los de un día se pueden quitar de él.

### Mundo
- **Globo 3D** con un **pin** por cada sitio pendiente y una **bandera** por cada plan hecho.
- Satélite (Esri) de lejos y mapa (OpenStreetMap) de cerca. Al cambiar de uno a otro, una transición de **caída entre nubes** en 3D (nubes procedurales con ruido fractal, pintadas en canvas).
- **Toca un pin** y la cámara vuela hasta allí con el zoom al máximo; sale un popup con el nombre del sitio, el plan y un botón para abrirlo en Google Maps.
- Botón para **volver a la vista inicial**.

### Chat
- Chat del grupo en tiempo real, viendo **quién está conectado**.
- Desliza a la izquierda para **responder** (con cita) y a la derecha para **borrar** tus mensajes.
- Contador de no leídos en la pestaña.
- **Notificaciones push** (también con la app cerrada) a los demás del grupo, salvo a quien ya tiene la app abierta. Al tocar el aviso se abre el chat de ese grupo.

### Y además
- **Tres idiomas:** español, ruso e italiano (se elige en la barra lateral y se recuerda por dispositivo).
- **Novedades** en un popup animado (botón ✦ arriba a la derecha).
- **Instalable** (PWA): propuesta de instalación la primera vez, con instrucciones específicas para iPhone y Mac.
- Imagen para compartir (Open Graph) generada con el logo.
- Respeta «reducir movimiento»: sin vídeos ni animaciones.

---

## Stack

| Parte | Qué se usa |
| --- | --- |
| Web | [Next.js 16](https://nextjs.org) (App Router, `cacheComponents`), React 19, TypeScript, CSS a mano |
| Datos, cuentas, tiempo real | [Appwrite Cloud](https://appwrite.io) (Frankfurt): Auth, Teams, TablesDB, Realtime, Presences |
| Lógica de servidor | Appwrite Functions (Node 24): `grupos` y `avisar-mensaje` |
| Avisos | Web Push (VAPID) con [`web-push`](https://github.com/web-push-libs/web-push) y un service worker propio |
| Globo | [globe.gl](https://globe.gl) (three.js) |
| Mapas | Teselas de [Esri World Imagery](https://www.esri.com/) y [OpenStreetMap](https://www.openstreetmap.org/copyright) |
| Búsqueda de sitios | [Geoapify](https://www.geoapify.com/) (autocompletado), con [Photon](https://photon.komoot.io/) como alternativa sin clave y [Nominatim](https://nominatim.org/) para la búsqueda normal |
| Hosting | [Netlify](https://www.netlify.com/) |

---

## Estructura

```
app/
  page.tsx            Pantalla principal: login/alta, grupos, planes, pestañas
  Chat.tsx            Chat del grupo, presencia y no leídos
  Comentarios.tsx     Comentarios de un plan (diálogo tipo «post»)
  Mundo.tsx           Globo 3D, marcadores, vuelo y transición de nubes
  nubes.ts            Nubes procedurales (ruido fractal en canvas)
  Lateral.tsx         Barra lateral: cuenta, grupo, avisos, idioma
  FormGrupo.tsx       Crear grupo / unirse con código
  grupos.ts           Llamadas a Teams y a la función «grupos»
  Novedades.tsx       Botón y popup de novedades
  Instalar.tsx        Propuesta de instalar la PWA
  Deslizable.tsx      Elemento que se desliza (borrar / responder)
  borrado.ts          Borrado con deshacer
  lugar.ts            Búsqueda de sitios, links de Google Maps, teselas
  api/lugar/route.ts  Resuelve links de Google Maps en el servidor
  notificaciones.ts   Suscripción a Web Push
  i18n.ts             Textos en es / ru / it
  appwrite.ts         Cliente de Appwrite
  opengraph-image.tsx Imagen para compartir
functions/
  grupos/             Crear, unirse (máx. 3) y borrar grupos
  avisar-mensaje/     Push a los demás del grupo al llegar un mensaje
public/
  sw.js               Service worker (avisos y abrir el chat)
  videos/             Fondos del login
```

---

## Ponerlo en marcha

### 1. Requisitos
- Node.js 20 o superior
- Un proyecto en [Appwrite Cloud](https://cloud.appwrite.io)
- (Opcional) Una clave gratuita de [Geoapify](https://myprojects.geoapify.com/) para las sugerencias de sitios

### 2. Instalar y arrancar

```bash
npm install
npm run dev
```

El endpoint y el ID del proyecto de Appwrite están en `app/appwrite.ts` (son públicos: lo que protege los datos son el login y los permisos). Cámbialos por los de tu proyecto, y añade `localhost` y tu dominio como plataformas web en la consola de Appwrite.

### 3. Variables de entorno

En `.env.local` (y en Netlify):

| Variable | Para qué |
| --- | --- |
| `NEXT_PUBLIC_GEOAPIFY_KEY` | Sugerencias de sitios. Sin ella se usa Photon (más lento y con direcciones peores) |

`URL` la pone Netlify sola (se usa como base de las URLs de Open Graph).

### 4. Base de datos (Appwrite TablesDB)

Base de datos `nuestra-lista`. Todas las tablas con **seguridad por fila** y, a nivel de tabla, solo `create("users")`: quién puede leer cada fila lo dicen sus propios permisos (el equipo del grupo).

| Tabla | Columnas | Permisos de cada fila |
| --- | --- | --- |
| `planes` | `texto`, `quien`, `hecho`, `lugar`, `lat`, `lng`, `likes[]`, `grupo`, `fecha` (`AAAA-MM-DD`) | leer, editar y borrar: el grupo |
| `mensajes` | `texto`, `autor`, `autorId`, `respondeA`, `respondeAutor`, `respondeTexto`, `grupo` | leer: el grupo · editar y borrar: el autor |
| `comentarios` | `planId`, `texto`, `autor`, `autorId`, `grupo` | leer: el grupo · editar y borrar: el autor |
| `reacciones` | `comentarioId`, `userId`, `grupo` (índice único por comentario y persona) | leer: el grupo · borrar: quien reaccionó |
| `suscripciones` | `userId`, `endpoint`, `p256dh`, `auth` | leer y borrar: el propio usuario |
| `grupos` | `nombre`, `codigo` (índice único) | leer: el grupo · solo la escribe la función `grupos` |
| `intentos` | `userId` | ninguno: solo el servidor (cuenta los códigos de invitación fallidos) |

Índices `key` sobre `grupo` en planes, mensajes y comentarios, y sobre `planId` en comentarios.

Cada grupo es un **Team** de Appwrite; quien lo crea tiene el rol `owner`.

### 5. Funciones (Appwrite Functions, Node 24)

| Función | Se dispara | Permisos (scopes) |
| --- | --- | --- |
| `grupos` | La app la ejecuta (`execute: users`) con `{ accion: "crear" \| "unirse" \| "borrar" \| "eliminar-cuenta" }` | `teams.read`, `teams.write`, `rows.read`, `rows.write`, `users.read`, `users.write` |
| `avisar-mensaje` | Evento `tablesdb.nuestra-lista.tables.mensajes.rows.*.create` | `rows.read`, `rows.write`, `presences.read`, `teams.read` |

`avisar-mensaje` necesita las variables `VAPID_PUBLIC`, `VAPID_PRIVATE` (secreta) y `VAPID_SUBJECT` (por ejemplo `mailto:tu@email`). Se generan con `npx web-push generate-vapid-keys`; la pública también va en `app/notificaciones.ts`.

Para desplegarlas con el CLI de Appwrite:

```bash
npx appwrite-cli functions create-deployment --function-id grupos \
  --code functions/grupos --entrypoint src/main.js \
  --commands "npm install --omit=dev" --activate
```

### 6. Desplegar la web (Netlify)

```bash
netlify deploy --build --prod
```

`netlify.toml` pone las cabeceras del service worker (Netlify sirve `public/` sin pasar por Next).

---

## Comprobaciones

```bash
npx tsc --noEmit                # tipos
npm run lint                    # ESLint
node --test app/*.test.ts       # tests (tiempo, links de Google Maps, fechas y errores de contraseña)
```

---

## Seguridad

- **Permisos por fila:** ninguna tabla se puede leer por ser usuario; cada fila lleva los permisos del equipo del grupo (Appwrite los aplica en el servidor, también en el tiempo real).
- **El servidor decide lo importante:** el límite de 3 personas, unirse con código, borrar grupos y eliminar cuentas van en una función con sus propias comprobaciones.
- **Códigos de invitación:** 5 fallos cada 15 minutos por cuenta como máximo (los cuenta una tabla que solo toca el servidor).
- **Avisos push:** el servidor solo envía a servicios de Chrome, Firefox, Safari y Edge (lista cerrada, contra SSRF) y solo si quien escribe el mensaje es del grupo.
- **Política de contenido (CSP)** y cabeceras de seguridad (HSTS, Permissions-Policy, anti-iframe…): la página solo carga y se conecta a los servicios que usa. Si se añade uno nuevo, hay que añadirlo en `next.config.ts`.
- **`/api/lugar` exige sesión** (token de Appwrite) y solo sigue enlaces de Google.
- **Contraseñas:** mínimo 8, sin las del diccionario ni con datos personales; sesiones de 30 días como máximo.
- **Límites conocidos:** dentro de un grupo, alguien podría escribir mensajes o reacciones con el nombre de otro miembro (confianza entre amigos); la clave de Geoapify es pública por naturaleza, conviene restringirla por dominio en su panel.

---

## Algunas decisiones

- **El límite de 3 personas lo pone el servidor** (función `grupos`), no la app: desde el navegador no se puede saltar.
- **Los permisos van por fila** (equipo del grupo): aunque alguien pidiera datos a mano a la API, solo recibiría los de sus grupos.
- **Borrado con deshacer:** el plan o mensaje desaparece al momento, pero solo se borra en Appwrite si no se deshace en 5 segundos.
- **Likes atómicos** con operadores de Appwrite (`arrayAppend` / `arrayRemove`): no se pierde uno si dos personas pulsan a la vez.
- **Sin dependencias de UI:** diálogos nativos (`<dialog>`), animaciones CSS ligadas al scroll y CSS propio con la paleta pastel.
- **Búsqueda de sitios:** Nominatim prohíbe usarse para autocompletar, por eso las sugerencias van por Geoapify (o Photon) y Nominatim solo para la búsqueda al pulsar «Buscar».
- **La transición de nubes** tapa el globo mientras cambia de satélite a mapa y no se despeja hasta que han cargado las teselas nuevas.

---

## Créditos

- Imágenes de satélite © Esri · Mapas © colaboradores de OpenStreetMap
- Búsqueda de sitios: Geoapify, Photon (Komoot) y Nominatim
- Tipografías: Manrope y JetBrains Mono (Google Fonts)
