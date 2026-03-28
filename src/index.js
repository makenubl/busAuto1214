require('dotenv').config();
const { connectToWhatsApp, onMessage } = require('./bot/connection');
const { routeMessage } = require('./bot/messageHandler');
const { getDb, seedDealersFromEnv, getAllDealers } = require('./db/database');
const config = require('./config');

async function main() {
  console.log('🚌 Bus Dealer WhatsApp Assistant');
  console.log('================================\n');

  // Initialize database
  getDb();
  console.log('✅ Database initialized');

  // Seed dealers from .env (only adds if not already present)
  seedDealersFromEnv(config.envDealerJids);
  const dealers = getAllDealers();
  console.log(`👤 ${dealers.length} dealer(s) registered`);

  // Connect to WhatsApp
  console.log('📱 Connecting to WhatsApp...\n');
  await connectToWhatsApp();

  // Set up message handler
  onMessage(routeMessage);

  console.log('\n🟢 Bot is running. Waiting for messages...\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
