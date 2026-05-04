import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mercotrace.app',
  appName: 'Mercotrace',
  webDir: 'dist',
  backgroundColor: "#60A5FA",
  android: {
    backgroundColor: "#60A5FA",
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Uncomment the line below and replace with your PC's IP address for live reload
    // url: 'http://YOUR_PC_IP:8080',
    // cleartext: true, // Required for http:// connections
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 30000,
      launchAutoHide: false,
      launchFadeOutDuration: 120,
      backgroundColor: "#60A5FA",
      androidSplashResourceName: "launch_background",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      iosSpinnerStyle: "small",
      spinnerColor: "#999999",
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
