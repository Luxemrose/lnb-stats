# App para Android e iOS

LNB Stats se distribuye también como aplicación nativa para Android y iPhone, construida con
**Capacitor 8**. La app usa **el mismo código** que la web (`web/src`): no es una web remota metida
en un marco, sino la web compilada y empaquetada dentro de la app, más una capa nativa para lo que el
navegador del teléfono no resuelve (archivos, enlaces, botón Atrás, barras del sistema, sin conexión).

| | |
|---|---|
| Nombre | LNB Stats |
| Identificador (Android `applicationId` / iOS Bundle ID) | `io.github.luxemrose.lnbstats` |
| Android | mínimo Android 7.0 (API 24), objetivo API 36 |
| iOS | mínimo iOS 15.0, Swift Package Manager (sin CocoaPods) |
| Proyectos nativos | `web/android/` (Android Studio / Gradle) y `web/ios/App/` (Xcode) |
| Configuración | `web/capacitor.config.ts` |

---

## 1. Cómo funciona

### Datos y modo sin conexión

1. La app trae **adentro** una copia de `data/real.json` del momento en que se compiló. Si es la primera vez y no hay internet, igual muestra datos reales (de esa fecha).
2. Al abrir, compara esa copia con la **última guardada en el teléfono** y muestra la más nueva.
3. Enseguida pide `https://luxemrose.github.io/lnb-stats/data/real.json` (el mismo archivo que publica la web, que se actualiza cuatro veces por día). Si es más nuevo, lo muestra y lo guarda.
4. Sin conexión aparece el aviso **"Sin conexión · mostrando los datos guardados del …"** con la fecha real de esos datos. Nunca se muestran datos inventados: si no hay nada, se muestra el error con **Reintentar**.
5. Cuando vuelve la conexión, actualiza solo. También al volver a la app después de 20 minutos, con el botón de actualizar de la barra superior y deslizando hacia abajo desde el principio de la pantalla.

Código: `web/src/lib/data.tsx` (lógica) y `web/src/lib/native.ts` (archivo en el teléfono, red, tiempo límite de 15 s).

### Adaptaciones al teléfono

| Tema | Solución |
|---|---|
| Exportar CSV / PNG | En la app no hay "descargas": el archivo se guarda y se abre el menú **Compartir** del sistema (WhatsApp, Drive, Archivos…). |
| Enlaces externos (sitio de la Liga) | Se abren en el navegador integrado, sin sacar al usuario de la app. |
| Botón Atrás de Android | Cierra primero el buscador o el panel "Más"; después vuelve a la pantalla anterior; en el inicio sale de la app. |
| Muesca, isla, barra de gestos | Márgenes seguros (`--sat/--sab/--sal/--sar` en `index.css`). |
| Barras del sistema | Cambian de color con el tema claro/oscuro. |
| Gráficos | Tocando el gráfico se ve el valor del punto o barra (en celular no existe "pasar el mouse"). |
| Tamaño táctil | Botones de 42 px mínimo, filtros y pestañas de 36 px, campos con letra de 16 px (evita el zoom de iOS). |
| Horizontal | Barra superior y menú inferior más bajos. |
| Tipografía | Inter va dentro de la app (antes se cargaba de Google Fonts y fallaba sin conexión). |
| Escudos | Van dentro de la app; si aparece un escudo nuevo, se busca en la web publicada. |
| Ícono y pantalla de inicio | `web/assets/` → generados con `npm run app:assets`. |

En una computadora se puede simular el comportamiento de datos de la app agregando `?simular-app=1` a la URL de desarrollo.

---

## 2. Herramientas necesarias

| Para | Necesitás |
|---|---|
| Todo | Node.js 20+ (recomendado 22) y npm |
| Android | **JDK 21** y **Android Studio** (trae el Android SDK). Sirve cualquier sistema: Windows, macOS o Linux. |
| iOS | Una **Mac** con **Xcode 16 o posterior** (desde App Store). Sin Mac no se puede compilar para iPhone (salvo usando GitHub Actions, ver §8). |
| Publicar en Google Play | Cuenta de desarrollador de Google Play (pago único de US$ 25). |
| Publicar en App Store / TestFlight | Apple Developer Program (US$ 99 por año). |

Primera vez, dentro de `web/`:

```bash
npm ci
```

---

## 3. Compilar para Android

Siempre desde `web/`. Los comandos de abajo ya compilan la web y la copian al proyecto nativo (`npm run app:sync`).

### APK de prueba (para instalar directo en un teléfono)

```bash
npm run android:apk
```

Resultado: `web/android/app/build/outputs/apk/debug/app-debug.apk` (≈ 6 MB).

### AAB de publicación (el formato que pide Google Play)

```bash
npm run android:aab
```

Resultado: `web/android/app/build/outputs/bundle/release/app-release.aab`. Para subirlo a Play tiene que estar **firmado** (ver §6.2).

### Desde Android Studio

```bash
npm run android:open
```

Abre el proyecto; con el teléfono conectado (o un emulador) se toca ▶ **Run**.

> Si Gradle no encuentra el SDK, creá `web/android/local.properties` con `sdk.dir=/ruta/al/Android/sdk`
> (Android Studio lo crea solo). Ese archivo no se sube al repositorio.

---

## 4. Instalar en un teléfono Android

**Opción A — descargar el APK publicado (la más simple).** Cada vez que se publica la web, GitHub Actions
compila un APK de prueba y lo deja en https://luxemrose.github.io/lnb-stats/descargas/lnb-stats.apk
(también en *Configuración → App para el celular* dentro de la web).

1. Abrí ese enlace desde el navegador del teléfono y descargá el archivo.
2. Tocá el archivo descargado. Android avisa que la instalación desde esa fuente está bloqueada: **Configuración → Permitir desde esta fuente** y volvé.
3. **Instalar**. Si Play Protect pregunta, elegí **Instalar de todas formas** (pasa con cualquier app que no viene de la tienda).

**Opción B — por cable con `adb`.**

1. En el teléfono: *Ajustes → Acerca del teléfono →* tocar 7 veces **Número de compilación**; después *Opciones de desarrollador → Depuración por USB*.
2. Conectalo y aceptá el aviso de "¿Permitir depuración?".
3. ```bash
   adb install -r web/android/app/build/outputs/apk/debug/app-debug.apk
   ```

El APK de prueba está firmado con una clave de depuración: sirve para probar, no para la tienda. Para pasar de ese APK a la versión de Play hay que desinstalarlo primero (las firmas son distintas).

---

## 5. Compilar para iOS y probar en un iPhone

En la Mac, desde `web/`:

```bash
npm ci
npm run app:sync
npm run ios:open
```

Se abre Xcode con `ios/App/App.xcodeproj`. La primera vez Xcode descarga los paquetes de Capacitor (Swift Package Manager); esperá a que termine.

### En el simulador

Elegí un iPhone en la barra superior (por ejemplo *iPhone 16*) y tocá ▶.

### En un iPhone propio

1. *Xcode → Settings → Accounts* → agregá tu Apple ID (con uno gratuito alcanza para probar en tu propio teléfono; la app dura 7 días).
2. Seleccioná el target **App** → pestaña **Signing & Capabilities** → *Team*: tu equipo. Dejá *Automatically manage signing* activado.
   Si el identificador `io.github.luxemrose.lnbstats` ya está tomado en tu cuenta, cambialo acá y en `capacitor.config.ts` (`appId`).
3. Conectá el iPhone por cable, desbloquealo y tocá **Confiar**. En iOS 16+ activá *Ajustes → Privacidad y seguridad → Modo de desarrollador* (pide reiniciar).
4. Elegí tu iPhone en la barra superior de Xcode y tocá ▶.
5. La primera vez el iPhone pide confiar en el desarrollador: *Ajustes → General → VPN y gestión de dispositivos →* tu cuenta → **Confiar**.

Para probar con otras personas sin cable, usá **TestFlight** (§6.3).

---

## 6. Versiones nuevas y publicación

### 6.1 Generar una versión nueva

Cada cambio en `web/src` llega a la app recompilándola: `npm run app:sync` y después el paso de la plataforma.
Los **datos** no necesitan versión nueva: la app los baja sola de la web publicada.

Cada versión que se sube a una tienda necesita un número interno **mayor** que la anterior:

| | Número interno (sube siempre) | Versión visible |
|---|---|---|
| Android | `versionCode` → `-PlnbVersionCode=2` | `versionName` → `-PlnbVersionName=1.0.1` |
| iOS | *Build* (`CURRENT_PROJECT_VERSION`) | *Version* (`MARKETING_VERSION`) |

Android, sin tocar archivos:

```bash
cd web/android && ./gradlew bundleRelease -PlnbVersionCode=2 -PlnbVersionName=1.0.1
```

(Sin esos parámetros se usa `1` y `1.0.0`, definidos en `web/android/app/build.gradle`.)
iOS: en Xcode, target **App → General → Identity**, cambiá *Version* y *Build*.

Si cambia el ícono o la pantalla de inicio, reemplazá los PNG de `web/assets/` (ícono de 1024×1024, inicio de 2732×2732) y corré `npm run app:assets`.

### 6.2 Google Play Store

**Una sola vez:**

1. **Crear la clave de firma** (guardala en un lugar seguro y con copia: si se pierde, hay que pedirle a Google que la reemplace):
   ```bash
   keytool -genkeypair -v -keystore lnb-upload.jks -alias lnb -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Copiá `lnb-upload.jks` a `web/android/` y creá `web/android/keystore.properties`:
   ```properties
   storeFile=lnb-upload.jks
   storePassword=LA_CONTRASEÑA_DEL_ALMACÉN
   keyAlias=lnb
   keyPassword=LA_CONTRASEÑA_DE_LA_CLAVE
   ```
   Ambos archivos están en `.gitignore`: **nunca** se suben al repositorio.
3. Registrate en https://play.google.com/console (US$ 25) y verificá la identidad.
4. **Crear app** → nombre "LNB Stats", idioma español (Argentina), *App*, *Gratis*.

**Cada publicación:**

1. `npm run app:sync`, después `cd android && ./gradlew bundleRelease -PlnbVersionCode=N -PlnbVersionName=X.Y.Z`. Con `keystore.properties` presente, el AAB sale firmado.
2. En Play Console → *Prueba → Prueba interna* (o *Producción*) → **Crear versión** → subí `app-release.aab`. La primera vez aceptá **Firma de apps de Play** (Google guarda la clave final; la tuya queda como "clave de subida").
3. Completá la ficha y los formularios (se piden una sola vez):
   - **Ficha de Play Store:** descripción corta y completa, ícono 512×512 (`web/assets/icon-only.png` reducido), gráfico de funciones 1024×500 y al menos 2 capturas del teléfono.
   - **Política de privacidad:** hace falta una URL pública. La app no recolecta datos personales, no tiene cuentas, publicidad ni análisis; alcanza con una página que lo diga.
   - **Seguridad de los datos:** "No recopila ni comparte datos".
   - **Clasificación de contenido** (cuestionario: app de deportes, sin contenido sensible), **Público objetivo**, **Anuncios: no**.
   - **Acceso a la app:** "Toda la funcionalidad está disponible sin restricciones".
4. **Revisar y lanzar**. Las cuentas personales nuevas tienen que hacer antes una **prueba cerrada con al menos 12 personas durante 14 días** para poder pasar a producción (requisito vigente de Google Play).

### 6.3 Apple App Store (TestFlight y tienda)

**Una sola vez:**

1. Inscribite en https://developer.apple.com/programs/ (US$ 99/año; persona o empresa).
2. En https://developer.apple.com/account → *Identifiers* → **+** → App IDs → Bundle ID explícito `io.github.luxemrose.lnbstats` (sin capacidades extra).
3. En https://appstoreconnect.apple.com → *Apps* → **+** → Nueva app: plataforma iOS, nombre "LNB Stats", idioma español, el Bundle ID anterior, un SKU cualquiera (por ejemplo `lnbstats`).
4. Certificados y perfiles: con *Automatically manage signing* en Xcode y tu equipo seleccionado, Xcode los crea solo. No hace falta hacerlo a mano.

**Cada publicación:**

1. En la Mac: `npm run app:sync`, `npm run ios:open`. Subí *Version* y *Build* (§6.1).
2. En la barra superior elegí **Any iOS Device (arm64)**. Menú **Product → Archive**.
3. Se abre el *Organizer* → **Distribute App → App Store Connect → Upload**. Xcode firma y sube.
4. A los minutos aparece en App Store Connect → **TestFlight**. Agregá testers internos (hasta 100, con su correo) o un grupo externo (requiere una revisión corta de Apple). Los testers instalan la app **TestFlight** en el iPhone y aceptan la invitación.
5. Para la tienda: en App Store Connect → la app → versión → completá descripción, palabras clave, URL de soporte, **URL de política de privacidad**, capturas (iPhone 6,9" o 6,7", obligatorias), categoría *Deportes*, clasificación por edad. Elegí el build y **Enviar a revisión**.
6. **Privacidad de la app:** "No se recopilan datos". La app ya declara en `PrivacyInfo.xcprivacy` que no rastrea ni recolecta datos y el único uso de API sensible (almacenamiento de preferencias y fechas de archivos), y en `Info.plist` que no usa cifrado propio (`ITSAppUsesNonExemptEncryption = NO`), así que no pide el trámite de exportación.

> Apple a veces rechaza apps que "son solo una web". Esta app funciona sin conexión, tiene navegación
> nativa (botón Atrás, compartir, barras del sistema) y contenido propio; si igual lo objetan, en la
> respuesta conviene mencionar el modo sin conexión y la exportación de gráficos por el menú Compartir.

---

## 7. Comandos (`web/package.json`)

| Comando | Qué hace |
|---|---|
| `npm run app:sync` | Compila la web y la copia a `android/` e `ios/` (`cap sync`). |
| `npm run app:assets` | Genera íconos y pantallas de inicio desde `assets/`. |
| `npm run android:apk` | APK de prueba (`assembleDebug`). |
| `npm run android:aab` | AAB de publicación (`bundleRelease`). |
| `npm run android:open` / `npm run ios:open` | Abre Android Studio / Xcode. |

Dependencias de la app: `@capacitor/core`, `android`, `ios`, `app` (botón Atrás, ciclo de vida), `splash-screen`,
`network` (aviso sin conexión), `filesystem` (datos guardados, exportaciones), `share`, `browser`
y `@fontsource-variable/inter` (tipografía sin conexión). Para desarrollo: `@capacitor/cli` y `@capacitor/assets`.
Ninguna recolecta datos ni necesita claves.

---

## 8. Compilación automática (GitHub Actions)

`.github/workflows/mobile.yml` corre en cada cambio de `web/` (o a mano desde *Actions → App móvil → Run workflow*):

- **Android:** pruebas, APK de prueba y AAB, que quedan como *artifacts* descargables de la ejecución.
  El `versionCode` es el número de ejecución, así que siempre sube.
  Para que el AAB salga firmado, cargá en *Settings → Secrets and variables → Actions*:
  `ANDROID_KEYSTORE_BASE64` (el `.jks` en base64: `base64 -w0 lnb-upload.jks`), `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. Sin secretos, sale sin firmar.
- **iOS:** en una Mac de GitHub compila para el simulador (sin firma), así se comprueba que el proyecto de Xcode compila aunque no tengas Mac. Para TestFlight hace falta firmar, y eso se hace desde Xcode (§6.3).

Además, `deploy.yml` publica el APK de prueba en `descargas/lnb-stats.apk` junto con la web.

---

## 9. Pruebas realizadas

- Compilación Android: APK de prueba (6,2 MB) y AAB (4,6 MB). Verificado con `aapt2`: nombre "LNB Stats", permisos únicamente `INTERNET` y `ACCESS_NETWORK_STATE`, API mínima 24 y objetivo 36; dentro van la web, los datos, los 18 escudos y la tipografía.
- La web empaquetada, en modo app, probada con Playwright en Pixel 7, Android de 360×640, iPhone 14 vertical y horizontal: las 21 pantallas sin desbordes horizontales, sin botones de menos de 36 px y sin errores de JavaScript.
- 21 pruebas de uso: menú inferior, panel "Más", buscador global, filtros, pestañas, exportar CSV, comparador, tema, toque en gráficos de líneas y barras, botón Atrás, carga con conexión, **sin conexión** (aviso, datos guardados, navegación), **reconexión** (actualización sola), **primera apertura sin conexión** (datos incluidos en la app) y **sin ningún dato** (botón Reintentar).
- Pruebas automáticas existentes: 15 de la web (Vitest) y 30 del pipeline (pytest).

**Pendiente de probar en un equipo físico** (el entorno de desarrollo no tiene emulador ni Mac):
el menú Compartir, el navegador integrado, el botón Atrás físico, los colores de las barras del sistema
y la pantalla de inicio. iOS se compila en GitHub Actions; hay que confirmar ese primer resultado en la pestaña *Actions*.
