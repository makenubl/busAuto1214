const { sendText } = require('../bot/sender');
const { getAllContacts, activateRequest } = require('../db/database');
const { generateBroadcastMessage } = require('./claude');

/**
 * Broadcast a buyer requirement to all seller contacts.
 */
async function broadcastToSellers(request) {
  const contacts = getAllContacts();

  if (contacts.length === 0) {
    return { sent: 0, message: 'No seller contacts found. Add sellers first using: add seller <phone> <name>' };
  }

  // Generate the broadcast message
  const parsed = JSON.parse(request.parsed || '{}');
  const broadcastMsg = await generateBroadcastMessage(parsed);

  // Activate the request
  activateRequest(request.id);

  let sent = 0;
  const failed = [];

  for (const contact of contacts) {
    try {
      await sendText(contact.phone, broadcastMsg);
      sent++;
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (err) {
      console.error(`Failed to send to ${contact.phone}:`, err.message);
      failed.push(contact.name || contact.phone);
    }
  }

  return {
    sent,
    total: contacts.length,
    failed,
    message: `✅ Sent to ${sent}/${contacts.length} sellers.${failed.length ? `\n❌ Failed: ${failed.join(', ')}` : ''}`,
  };
}

module.exports = { broadcastToSellers };
