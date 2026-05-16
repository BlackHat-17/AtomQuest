// Validate environment variables before anything else
import './lib/env';

import { createApp } from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const app = createApp();

const server = app.listen(PORT, () => {
  console.warn(`[server] Goal Tracking Portal API running on http://localhost:${PORT}`);
  console.warn(`[server] Health check: http://localhost:${PORT}/health`);
  console.warn(`[server] Environment: ${process.env.NODE_ENV ?? 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.warn('[server] SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.warn('[server] Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.warn('[server] SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.warn('[server] Server closed.');
    process.exit(0);
  });
});

export default app;
