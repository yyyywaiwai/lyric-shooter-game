import path from 'path';
import { execSync } from 'child_process';
import { defineConfig, loadEnv } from 'vite';

const getGitMetadata = () => {
    try {
        const hash = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim();
        const message = execSync('git log -1 --pretty=%s', { stdio: 'pipe' }).toString().trim();
        const combined = [hash, message].filter(Boolean).join(' - ');
        return {
            hash: hash || 'unknown',
            message: message || 'unknown',
            combined: combined || 'unknown',
        };
    } catch {
        return {
            hash: 'unknown',
            message: 'unknown',
            combined: 'unknown',
        };
    }
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const git = getGitMetadata();
    return {
      base: mode === 'production' ? '/lyric-shooter-game/' : '/',
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.LS_SERVER_URL_DEFAULT': JSON.stringify(env.LS_SERVER_URL_DEFAULT || ''),
        'process.env.LS_OPERATION_MODE': JSON.stringify(env.LS_OPERATION_MODE || 'split'),
        'process.env.APP_VERSION_HASH': JSON.stringify(git.hash),
        'process.env.APP_VERSION_MESSAGE': JSON.stringify(git.message),
        'process.env.APP_VERSION': JSON.stringify(git.combined),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
