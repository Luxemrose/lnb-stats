import type { CapacitorConfig } from "@capacitor/cli";

/**
 * LNB Stats como app de Android e iOS (Capacitor).
 * La app incluye su propia copia del sitio (carpeta dist/) y los datos de la última compilación;
 * al abrirse, busca los datos más recientes en la versión publicada y los guarda para usar sin conexión.
 */
const config: CapacitorConfig = {
  // Identificador único en las tiendas. Usa el dominio que ya controla el proyecto (luxemrose.github.io).
  // No se puede cambiar después de publicar.
  appId: "io.github.luxemrose.lnbstats",
  appName: "LNB Stats",
  webDir: "dist",
  backgroundColor: "#10141D",
  android: {
    backgroundColor: "#10141D",
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: "#10141D",
    contentInset: "never",
  },
  plugins: {
    SystemBars: {
      // Android 15+ dibuja la app de borde a borde: Capacitor expone las zonas seguras como variables CSS.
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      style: "DARK",
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: false, // la app la oculta cuando los datos están listos
      backgroundColor: "#10141D",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
  },
};

export default config;
