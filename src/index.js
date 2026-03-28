require('dotenv').config();
const { connectToWhatsApp, onMessage } = require('./bot/connection');
const { routeMessage } = require('./bot/messageHandler');
const { getDb, seedDealersFromEnv, getAllDealers, getDueReminders, markReminderSent } = require('./db/database');
const { sendText } = require('./bot/sender');
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

  // Check reminders every 60 seconds
  setInterval(async () => {
    try {
      const dueReminders = getDueReminders();
      for (const reminder of dueReminders) {
        await sendText(reminder.dealer_jid, `⏰ *یاد دہانی:*\n\n${reminder.reminder_text}`);
        markReminderSent(reminder.id);
        console.log(`⏰ Reminder #${reminder.id} sent`);
      }
    } catch (err) {
      console.error('Reminder check failed:', err.message);
    }
  }, 60000);

  console.log('\n🟢 Bot is running. Waiting for messages...\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
