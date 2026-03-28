const { handleDealerMessage } = require('../handlers/dealer');
const { handleSellerMessage } = require('../handlers/seller');
const { transcribeVoiceMessage } = require('../services/whisper');
const { logMessage } = require('../db/database');
const config = require('../config');

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
      const { sendText } = require('../bot/sender');
      await sendText(jid, '❌ Could not transcribe voice message. Please send as text.');
      return;
    }
  }

  // No text content and not a voice message → might be media only
  if (!text && !isVoiceMessage(msg)) {
    // For sellers with media-only messages, still handle them
    if (jid !== config.dealerPhone) {
      const messageType = Object.keys(msg.message || {})[0];
      const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage'];
      if (mediaTypes.includes(messageType)) {
        text = '';  // Allow seller handler to process the media
      } else {
        return; // Ignore other non-text messages
      }
    } else {
      return;
    }
  }

  // Route to appropriate handler
  if (jid === config.dealerPhone) {
    console.log(`👤 Dealer: "${text}"`);
    await handleDealerMessage(jid, text);
  } else {
    console.log(`🏢 Seller (${jid}): "${text || '[media]'}"`);
    await handleSellerMessage(msg, jid, text);
  }
}

module.exports = { routeMessage };
