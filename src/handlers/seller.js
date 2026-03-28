const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { sendText } = require('../bot/sender');
const { getActiveRequest, addResponse, getContactByPhone, getAllDealers } = require('../db/database');
const { formatPhoneDisplay } = require('../utils/helpers');
const config = require('../config');
const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, '../../media');

/**
 * Handle messages from sellers (anyone who isn't the dealer).
 */
async function handleSellerMessage(msg, jid, text) {
  const active = getActiveRequest();

  if (!active) {
    // No active request — ignore seller messages or send a brief note
    console.log(`📩 Message from ${formatPhoneDisplay(jid)} but no active request. Ignoring.`);
    return;
  }

  // Download any media attached to the message
  const mediaUrls = await downloadSellerMedia(msg);

  // Store the response
  addResponse(active.id, jid, text, mediaUrls);

  // Acknowledge to seller
  await sendText(jid, '✅ Thank you! Your response has been recorded. We will get back to you soon.');

  // Notify all dealers
  const contact = getContactByPhone(jid);
  const sellerName = contact?.name || formatPhoneDisplay(jid);
  const mediaNote = mediaUrls.length > 0 ? ` [${mediaUrls.length} photo/video]` : '';

  const dealers = getAllDealers();
  for (const dealer of dealers) {
    await sendText(dealer.jid,
      `📩 *New response for Request #${active.id}*\n` +
      `From: ${sellerName}\n` +
      `${text || '(media only)'}${mediaNote}\n\n` +
      `Send "results" to see all responses.`
    );
  }
}

/**
 * Download media from a seller's message and save locally.
 */
async function downloadSellerMedia(msg) {
  const mediaUrls = [];
  const messageType = Object.keys(msg.message || {})[0];

  const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'];
  if (!mediaTypes.includes(messageType)) {
    return mediaUrls;
  }

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});

    // Determine extension
    const mimeType = msg.message[messageType]?.mimetype || 'application/octet-stream';
    const extMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'video/mp4': 'mp4',
      'audio/ogg; codecs=opus': 'ogg',
      'application/pdf': 'pdf',
    };
    const ext = extMap[mimeType] || 'bin';
    const filename = `seller_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const filepath = path.join(MEDIA_DIR, filename);

    fs.writeFileSync(filepath, buffer);
    mediaUrls.push(filepath);
    console.log(`📎 Saved media: ${filename}`);
  } catch (err) {
    console.error('Failed to download media:', err.message);
  }

  return mediaUrls;
}

module.exports = { handleSellerMessage };
