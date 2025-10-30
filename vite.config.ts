import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: mode === 'production' ? '/lyric-shooter-game/' : '/',
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.LS_SERVER_URL_DEFAULT': JSON.stringify(env.LS_SERVER_URL_DEFAULT || ''),
        'process.env.LS_OPERATION_MODE': JSON.stringify(env.LS_OPERATION_MODE || 'split')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
