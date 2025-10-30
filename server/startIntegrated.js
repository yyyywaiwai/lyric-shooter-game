process.env.LS_OPERATION_MODE = process.env.LS_OPERATION_MODE || 'integrated';
process.env.LS_SERVE_FRONTEND = process.env.LS_SERVE_FRONTEND || '1';

await import('./index.js');
