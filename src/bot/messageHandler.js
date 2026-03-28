const { handleDealerMessage } = require('../handlers/dealer');
const { handleSellerMessage } = require('../handlers/seller');
const { transcribeVoiceMessage } = require('../services/whisper');
const { logMessage, isDealer, useInvite, addDealer, addContact } = require('../db/database');
const { sendText } = require('./sender');
const { normalizePhone, formatPhoneDisplay } = require('../utils/helpers');

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
 * Extract contact info from a vCard message.
 */
function extractVCard(msg) {
  const vcard = msg.message?.contactMessage?.vcard || msg.message?.contactsArrayMessage?.contacts?.[0]?.vcard;
  if (!vcard) return null;

  const nameMatch = vcard.match(/FN:(.*)/);
  const telMatch = vcard.match(/TEL[^:]*:([\d+\s-]+)/);

  if (telMatch) {
    return {
      name: nameMatch ? nameMatch[1].trim() : 'نامعلوم',
      phone: telMatch[1].replace(/[\s-]/g, '').trim(),
    };
  }
  return null;
}

// Deduplication — prevent processing same message twice
const recentMessages = new Set();
function isDuplicate(msgId) {
  if (recentMessages.has(msgId)) return true;
  recentMessages.add(msgId);
  // Clean up after 60 seconds
  setTimeout(() => recentMessages.delete(msgId), 60000);
  return false;
}

/**
 * Main message router — dispatches to dealer or seller handler.
 */
async function routeMessage(msg) {
  const msgId = msg.key.id;
  if (isDuplicate(msgId)) {
    console.log(`⏭️ Duplicate message ${msgId}, skipping`);
    return;
  }

  const jid = msg.key.remoteJid;
  let text = extractText(msg);

  // Log incoming message
  logMessage(jid, 'bot', text || '[media]', null, 'incoming');

  // Handle contact card (vCard) — dealer shares a contact → add as seller
  const vcard = extractVCard(msg);
  if (vcard && isDealer(jid)) {
    const phone = normalizePhone(vcard.phone);
    addContact(phone, vcard.name, null, null);
    await sendText(jid, `✅ سیلر شامل کر دیا گیا: ${vcard.name} (${formatPhoneDisplay(phone)})`);
    console.log(`📇 Contact card → seller added: ${vcard.name} ${vcard.phone}`);
    return;
  }

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
