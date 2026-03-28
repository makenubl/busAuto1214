require('dotenv').config();
const { connectToWhatsApp, onMessage } = require('./bot/connection');
const { routeMessage } = require('./bot/messageHandler');
const { getDb } = require('./db/database');

async function main() {
  console.log('🚌 Bus Dealer WhatsApp Assistant');
  console.log('================================\n');

  // Initialize database
  getDb();
  console.log('✅ Database initialized');

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
