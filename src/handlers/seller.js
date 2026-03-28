const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { sendText } = require('../bot/sender');
const { getActiveRequest, addResponse, getContactByPhone, getAllDealers } = require('../db/database');
const { formatPhoneDisplay } = require('../utils/helpers');
const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, '../../media');

async function handleSellerMessage(msg, jid, text) {
  const active = getActiveRequest();

  if (!active) {
    console.log(`📩 ${formatPhoneDisplay(jid)} کا پیغام لیکن کوئی ایکٹو ریکوئسٹ نہیں۔`);
    return;
  }

  const mediaUrls = await downloadSellerMedia(msg);

  addResponse(active.id, jid, text, mediaUrls);

  await sendText(jid, '✅ شکریہ! آپ کا جواب محفوظ کر لیا گیا ہے۔ ہم جلد آپ سے رابطہ کریں گے۔');

  const contact = getContactByPhone(jid);
  const sellerName = contact?.name || formatPhoneDisplay(jid);
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
    console.log(`📎 میڈیا محفوظ: ${filename}`);
  } catch (err) {
    console.error('میڈیا ڈاؤنلوڈ ناکام:', err.message);
  }

  return mediaUrls;
}

module.exports = { handleSellerMessage };
