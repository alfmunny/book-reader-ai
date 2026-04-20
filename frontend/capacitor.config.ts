import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bookreader.ai',
  appName: 'Book Reader AI',
  webDir: 'out',
  server: {
    url: 'https://book-reader-ai.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#fdf8f0',
  },
};

export default config;
