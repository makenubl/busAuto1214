const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { sendText } = require('../bot/sender');
const { getActiveRequest, addResponse, getContactByPhone, getAllDealers, getProfile, upsertProfile, getChatHistory, addInventoryItem, addMediaToInventory, getLatestInventoryForSeller } = require('../db/database');
const { formatPhoneDisplay } = require('../utils/helpers');
const { handlePublicMessage } = require('../services/claude');
const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, '../../media');

async function handleSellerMessage(msg, jid, text) {
  const active = getActiveRequest();

  // If there's an active request and this is a known seller contact, store their response
  const contact = getContactByPhone(jid);
  if (active && contact) {
    const mediaUrls = await downloadSellerMedia(msg);
    addResponse(active.id, jid, text, mediaUrls);

    await sendText(jid, '✅ شکریہ! آپ کا جواب محفوظ کر لیا گیا ہے۔ ہم جلد آپ سے رابطہ کریں گے۔');

    const sellerName = contact.name || formatPhoneDisplay(jid);
    const mediaNote = mediaUrls.length > 0 ? ` [${mediaUrls.length} تصویر/ویڈیو]` : '';

    const dealers = getAllDealers();
    for (const dealer of dealers) {
      await sendText(dealer.jid,
        `📩 *ریکوئسٹ #${active.id} کا نیا جواب*\n` +
        `بھیجنے والا: ${sellerName}\n` +
        `${text || '(صرف میڈیا)'}${mediaNote}\n\n` +
        `تمام جوابات دیکھنے کے لیے "نتائج" بھیجیں۔`
      );
    }
    return;
  }

  // For anyone else (buyers, sellers, unknown) — use Claude with history + profile
  const chatHistory = getChatHistory(jid, 20);
  const profile = getProfile(jid);
  const displayPhone = formatPhoneDisplay(jid);

  const reply = await handlePublicMessage(text, jid, displayPhone, chatHistory, profile);
  await sendText(jid, reply.response);

  // Update contact profile with AI-generated insights
  if (reply.profileUpdate) {
    upsertProfile(jid, {
      ...reply.profileUpdate,
      phone_display: displayPhone,
    });
  } else {
    upsertProfile(jid, { phone_display: displayPhone });
  }

  // If selling inquiry, save to inventory
  if (reply.type === 'selling' && reply.inventoryData) {
    const invId = addInventoryItem(jid, reply.profileUpdate?.name || displayPhone, text, reply.inventoryData, []);
    // Attach any media sent with this message
    const mediaUrls = await downloadSellerMedia(msg);
    for (const mediaPath of mediaUrls) {
      addMediaToInventory(invId, mediaPath);
    }
    console.log(`📦 Inventory item #${invId} added from ${displayPhone}`);
    return; // Already handled media, skip the media section below
  }

  // Notify dealers if it's an important message (buying/selling inquiry)
  if (reply.notifyDealer) {
    const dealers = getAllDealers();
    for (const dealer of dealers) {
      await sendText(dealer.jid,
        `📬 *نیا پیغام*\n` +
        `بھیجنے والا: ${formatPhoneDisplay(jid)}\n` +
        `قسم: ${reply.type}\n` +
        `پیغام: ${text}\n\n` +
        `جواب دینے کے لیے اس نمبر پر خود رابطہ کریں۔`
      );
    }
  }

  // Download and store any media
  const mediaUrls = await downloadSellerMedia(msg);
  if (mediaUrls.length > 0 && reply.notifyDealer) {
    const dealers = getAllDealers();
    const { forwardMedia } = require('../bot/sender');
    for (const dealer of dealers) {
      for (const mediaPath of mediaUrls) {
        try {
          if (fs.existsSync(mediaPath)) {
            const buffer = fs.readFileSync(mediaPath);
            const ext = mediaPath.split('.').pop().toLowerCase();
            const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4' };
            await forwardMedia(dealer.jid, buffer, mimeMap[ext] || 'application/octet-stream', `${formatPhoneDisplay(jid)} کی طرف سے`);
          }
        } catch (err) {
          console.error('میڈیا فارورڈ ناکام:', err.message);
        }
      }
    }
  }
}

async function downloadSellerMedia(msg) {
  const mediaUrls = [];
  const messageType = Object.keys(msg.message || {})[0];

  const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage'];
  if (!mediaTypes.includes(messageType)) {
    return mediaUrls;
  }

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});

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
  } catch (err) {
    console.error('میڈیا ڈاؤنلوڈ ناکام:', err.message);
  }

  return mediaUrls;
}

module.exports = { handleSellerMessage };
