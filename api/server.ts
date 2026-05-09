import app from './app.js';
import { initializeSampleData } from './seed.js';
import { ready as dbReady } from './database.js';

const PORT = process.env.PORT || 3001;

dbReady.then(async () => {
  await initializeSampleData();
  
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server ready on port ${PORT}`);
    console.log(`📡 API: http://localhost:${PORT}/api`);
    console.log(`🔗 Mock Proxy: http://localhost:${PORT}/api/mock/proxy/{path}`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

export default app;
