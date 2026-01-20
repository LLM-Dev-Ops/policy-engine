/**
 * LLM-CostOps Service Entry Point
 */
export * from './contracts';
export * from './agents';
export * from './config';
export { startServer, app } from './api/server';

// Start server if running directly
if (require.main === module) {
  require('./api/server').startServer();
}
