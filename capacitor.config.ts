import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pk.watapp',
  appName: 'WAT App',
  webDir: 'out',
  server: {
    url: 'https://watapp.pk',
    cleartext: false
  }
};

export default config;
