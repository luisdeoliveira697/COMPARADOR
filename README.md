# Comparador de Proveedores

App web para la ferretería: cruza los catálogos de los proveedores, aplica descuentos, condiciones y métodos de pago (con tasas BCV y Binance del día) y arma el pedido más barato.

- Se abre desde cualquier navegador (PC o celular) y se puede **instalar como app**.
- Los datos se comparten entre varias personas con **Firebase** (gratis), cada una entra con su cuenta de Google.
- Las tasas (dólar y euro BCV, Binance P2P) se actualizan **solas 3 veces al día** con GitHub Actions (gratis).
- Para leer PDFs desordenados, escaneados o fotos, y revisar cruces dudosos, usa **tu clave de la API de Claude** (se paga por uso).

---

## Instalación (una sola vez, ~30 minutos)

### Paso 1 · Publicar la app en GitHub Pages

1. Crea una cuenta gratis en <https://github.com> (si no tienes).
2. Arriba a la derecha: **+ → New repository**. Nombre: `comparador` (o el que quieras). Déjalo **Public** y crea el repositorio.
3. En la página del repositorio: **Add file → Upload files**. Arrastra **todo el contenido** de esta carpeta (incluida la carpeta `.github` y `scripts`). Pulsa **Commit changes**.
   - Si tu sistema oculta la carpeta `.github`, actívala para verla (en Mac: `Cmd + Shift + .`; en Windows: Vista → Elementos ocultos).
4. Ve a **Settings → Pages**. En *Source* elige **Deploy from a branch**, rama **main**, carpeta **/(root)** y guarda.
5. En 1–2 minutos la app queda en: `https://TU-USUARIO.github.io/comparador/`

> El repositorio es público, pero ahí solo está el código y las tasas. Tus catálogos, precios y pedidos se guardan en Firebase, protegidos con acceso por usuario.

### Paso 2 · Activar la actualización diaria de tasas

1. En el repositorio: **Settings → Actions → General → Workflow permissions** → marca **Read and write permissions** y guarda.
2. Ve a la pestaña **Actions**, abre **Actualizar tasas del día** y pulsa **Run workflow** para probarla.
3. Al terminar (1 minuto), abre el registro: la última línea dice las tasas obtenidas y de qué fuente.

Corre sola a las **7:10 a. m., 1:10 p. m. y 6:10 p. m. (hora de Caracas)**. Busca el dólar y el euro en la página del BCV (con respaldo en otra fuente) y el dólar Binance como la mediana de los anuncios de Binance P2P (con respaldos). Si no consigue una tasa, conserva la anterior y la app muestra la fecha en amarillo. Cuando el BCV publica en la tarde la tasa del día siguiente, se guarda y se activa ese día.

### Paso 3 · Crear la base de datos compartida (Firebase)

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google → **Crear un proyecto** (nombre: `ferreteria`, puedes desactivar Google Analytics).
2. **Firestore Database** → **Crear base de datos** → ubicación cercana (por ejemplo `us-east1`) → modo **producción**.
3. En Firestore → pestaña **Reglas**: borra lo que hay, pega el contenido del archivo `firestore.rules`, **cambia `TU_CORREO@gmail.com` por tu correo de Google** y pulsa **Publicar**. Ese correo será el administrador.
4. **Authentication** → **Comenzar** → en *Proveedores de acceso* activa **Google** y guarda.
5. En Authentication → **Configuración → Dominios autorizados** → **Agregar dominio**: `TU-USUARIO.github.io`.
6. Engranaje ⚙ → **Configuración del proyecto** → en *Tus apps* pulsa el ícono **</>** (Web), ponle un nombre y registra. Copia el bloque `const firebaseConfig = { ... }`.
7. Para que todos se conecten sin configurar nada: en GitHub abre `config.js` → lápiz (editar) → reemplaza `firebase: null` por tu configuración (hay un ejemplo en el archivo) → **Commit changes**.
   - Alternativa: abre la app y pega la configuración en la pantalla de bienvenida (hay que hacerlo en cada equipo).

### Paso 4 · Entrar y agregar a tu equipo

1. Abre la app → **Entrar con Google** con el correo administrador.
2. **⚙ Ajustes → Usuarios autorizados**: agrega los correos de Google de las personas que la usarán. Ellos solo abren el enlace y entran con su cuenta.

### Paso 5 · Clave de Claude (opcional, para PDFs, fotos y cruces dudosos)

1. Crea una clave en <https://console.anthropic.com> → *API Keys* (requiere cargar saldo; leer un catálogo cuesta centavos).
2. En la app: **⚙ Ajustes → Clave de la API de Anthropic** → pégala → **Probar**.
3. La clave se guarda solo en ese navegador; cada equipo que quiera usar estas funciones debe ponerla.

### Instalar como app

- **PC (Chrome/Edge):** ícono de instalar en la barra de direcciones (o menú ⋮ → *Instalar Comparador de Proveedores*).
- **Android (Chrome):** menú ⋮ → *Agregar a pantalla principal*.
- **iPhone (Safari):** botón compartir → *Agregar a inicio*.

---

## Uso sin internet ni nube

En la pantalla de bienvenida puedes elegir **Solo en este equipo**: los datos quedan en ese navegador. Usa **⚙ Ajustes → Descargar respaldo** de vez en cuando; con **Restaurar respaldo** puedes pasar los datos a otro equipo o a la nube.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app completa |
| `config.js` | Configuración de Firebase compartida |
| `rates.json`, `rates-history.json` | Tasas del día e historial (las escribe la actualización automática) |
| `scripts/update-rates.mjs`, `.github/workflows/tasas.yml` | Actualización automática de tasas |
| `firestore.rules` | Reglas de seguridad para pegar en Firebase |
| `manifest.webmanifest`, `sw.js`, `icon*` | Permiten instalarla como app |

## Límites del plan gratuito de Firebase

50.000 lecturas y 20.000 escrituras por día y 1 GB de datos: de sobra para una ferretería. Cada catálogo se guarda en bloques de 900 productos.
