/**
 * Integración con la app nativa (Capacitor) para Android e iOS.
 *
 * El resto de la app no sabe si corre en un navegador o en un teléfono: todo lo específico
 * de la plataforma está acá. En el navegador, cada función usa el comportamiento web de siempre.
 */
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // "android" | "ios" | "web"

/** Sitio publicado: de ahí la app descarga los datos más recientes (los actualiza GitHub Actions). */
export const REMOTE_BASE = "https://luxemrose.github.io/lnb-stats/";

/**
 * En el navegador se puede simular el comportamiento de la app (datos remotos + caché local) con
 * ?simular-app=1 en la dirección. Sirve para probar el modo sin conexión sin un teléfono.
 */
export const appDataMode = isNative || (() => {
  try { return new URLSearchParams(window.location.search).get("simular-app") === "1"; } catch { return false; }
})();

// ------------------------------------------------------------- caché de datos

const CACHE_PREFIX = "lnb-cache-";

/** Guarda una copia de los datos descargados (archivo privado de la app; en el navegador, IndexedDB). */
export async function writeCache(name: string, text: string): Promise<void> {
  try {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({ path: `${CACHE_PREFIX}${name}`, data: text, directory: Directory.Data, encoding: Encoding.UTF8 });
  } catch { /* sin espacio o sin permiso: la app sigue funcionando, sólo que sin copia local */ }
}

export async function readCache(name: string): Promise<string | null> {
  try {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const r = await Filesystem.readFile({ path: `${CACHE_PREFIX}${name}`, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof r.data === "string" ? r.data : await (r.data as Blob).text();
  } catch { return null; }
}

/** fetch con tiempo límite: en conexiones malas no queremos esperar indefinidamente. */
export async function fetchWithTimeout(url: string, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { cache: "no-cache", signal: ctrl.signal }); } finally { clearTimeout(t); }
}

// ------------------------------------------------------------- archivos exportados

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Exporta un archivo (CSV, PNG). En el navegador lo descarga; en el teléfono lo guarda en la caché
 * de la app y abre el menú "Compartir" del sistema (Drive, WhatsApp, Archivos, Gmail, etc.),
 * porque los WebView de Android e iOS no permiten descargas directas.
 */
export async function saveFile(filename: string, blob: Blob): Promise<void> {
  if (!isNative) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const written = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [written.uri], dialogTitle: "Guardar o compartir" });
  } catch { /* el usuario cerró el menú: no es un error */ }
}

/** Copia texto al portapapeles (con alternativa para WebView antiguos). */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* sigue con la alternativa */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

// ------------------------------------------------------------- comportamiento nativo

/** Enlaces externos (sitio de la Liga, fichas oficiales): navegador del sistema, no dentro de la app. */
function interceptExternalLinks() {
  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href)) return;
    const u = new URL(href);
    if (u.hostname === "localhost") return;
    e.preventDefault();
    void import("@capacitor/browser").then(({ Browser }) => Browser.open({ url: href }));
  }, true);
}

/** Inicialización una sola vez al arrancar la app nativa. */
export function initNative() {
  if (!isNative) return;
  document.documentElement.classList.add("is-native", `platform-${platform}`);
  interceptExternalLinks();
}

/** Oculta la pantalla de inicio cuando la primera vista está lista. */
export async function hideSplash() {
  if (!isNative) return;
  try { const { SplashScreen } = await import("@capacitor/splash-screen"); await SplashScreen.hide({ fadeOutDuration: 250 }); } catch { /* nada */ }
}

/** Íconos de la barra de estado claros u oscuros según el tema de la app. */
export async function setSystemBarsTheme(theme: "dark" | "light") {
  if (!isNative) return;
  try {
    const { SystemBars, SystemBarsStyle } = await import("@capacitor/core");
    await SystemBars.setStyle({ style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
  } catch { /* plataforma sin soporte */ }
}

/** Avisos de conexión (vuelve la red -> se actualizan los datos). Devuelve la función para dejar de escuchar. */
export function onConnectivityChange(cb: (online: boolean) => void): () => void {
  const onOnline = () => cb(true), onOffline = () => cb(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  let remove: (() => void) | null = null;
  if (isNative) {
    void import("@capacitor/network").then(({ Network }) =>
      Network.addListener("networkStatusChange", (s) => cb(s.connected)).then((h) => { remove = () => void h.remove(); }));
  }
  return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); remove?.(); };
}

/** Botón "atrás" de Android. El manejador devuelve true si ya lo resolvió (p. ej. cerró un panel). */
export function onBackButton(handler: () => boolean): () => void {
  if (platform !== "android") return () => {};
  let remove: (() => void) | null = null;
  void import("@capacitor/app").then(({ App }) =>
    App.addListener("backButton", ({ canGoBack }) => {
      if (handler()) return;
      if (window.location.hash && window.location.hash !== "#/" && (canGoBack || window.history.length > 1)) window.history.back();
      else void App.exitApp();
    }).then((h) => { remove = () => void h.remove(); }));
  return () => remove?.();
}
