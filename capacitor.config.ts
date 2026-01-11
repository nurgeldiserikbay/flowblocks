import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thelightcome.flowblocks',
  appName: 'FlowBlocks',
  webDir: 'docs',
  server: {
    androidScheme: 'https'
  }
};

export default config;
