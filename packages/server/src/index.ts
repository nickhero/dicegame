import { serve } from '@hono/node-server';
import { createApp } from './app';
import { config } from './config';

const app = createApp();

console.log(`🎲 DiceWars server starting on port ${config.port}...`);

serve({
  fetch: app.fetch,
  port: config.port,
}, (info) => {
  console.log(`🎲 DiceWars server running at http://localhost:${info.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});
