const { handleDealerMessage } = require('../handlers/dealer');
const { handleSellerMessage } = require('../handlers/seller');
const { transcribeVoiceMessage } = require('../services/whisper');
const { logMessage, isDealer, useInvite, addDealer } = require('../db/database');
const { sendText } = require('./sender');

/**
 * Extract text content from a message.
 */
function extractText(msg) {
  if (msg.message?.conversation) return msg.message.conversation;
  if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
  if (msg.message?.imageMessage?.caption) return msg.message.imageMessage.caption;
  if (msg.message?.videoMessage?.caption) return msg.message.videoMessage.caption;
  return null;
}

/**
 * Check if message contains a voice/audio message.
 */
function isVoiceMessage(msg) {
  return !!(msg.message?.audioMessage);
}

/**
 * Main message router — dispatches to dealer or seller handler.
 */
async function routeMessage(msg) {
  const jid = msg.key.remoteJid;
  let text = extractText(msg);

  // Log incoming message
  logMessage(jid, 'bot', text || '[media]', null, 'incoming');

  // Handle voice messages — transcribe first
  if (isVoiceMessage(msg)) {
    console.log(`🎤 Voice message from ${jid}`);
    try {
      text = await transcribeVoiceMessage(msg);
    } catch (err) {
      console.error('Voice transcription failed:', err.message);
      await sendText(jid, '❌ وائس نوٹ سمجھ نہیں آئی۔ براہ کرم ٹیکسٹ میں بھیجیں۔');
      return;
    }
  }

  // No text content and not a voice message → might be media only
  if (!text && !isVoiceMessage(msg)) {
    if (!isDealer(jid)) {
      const messageType = Object.keys(msg.message || {})[0];
      const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage'];
      if (mediaTypes.includes(messageType)) {
        text = '';
      } else {
        return;
      }
    } else {
      return;
    }
  }

  // Check if sender is a dealer (from database)
  if (isDealer(jid)) {
    console.log(`👤 Dealer: "${text}"`);
    await handleDealerMessage(jid, text);
    return;
  }

  // Check if message is an invite code (JOIN-XXXX)
  if (text && /^JOIN-[A-Z0-9]{4}$/i.test(text.trim())) {
    const invite = useInvite(text.trim().toUpperCase());
    if (invite) {
      addDealer(jid, null);
      console.log(`✅ New dealer added via invite: ${jid}`);
      await sendText(jid, '✅ Welcome! You are now a dealer. Send "help" to see available commands.');
      return;
    } else {
      await sendText(jid, '❌ Invalid or expired invite code.');
      return;
    }
  }

  // Otherwise, treat as seller
  console.log(`🏢 Seller (${jid}): "${text || '[media]'}"`);
  await handleSellerMessage(msg, jid, text);
}

module.exports = { routeMessage };
