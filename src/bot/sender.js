const { getSock } = require('./connection');
const { logMessage } = require('../db/database');
const fs = require('fs');

/**
 * Send a text message
 */
async function sendText(jid, text) {
  const sock = getSock();
  if (!sock) throw new Error('WhatsApp not connected');

  await sock.sendMessage(jid, { text });
  logMessage('bot', jid, text, null, 'outgoing');
}

/**
 * Send an image with optional caption
 */
async function sendImage(jid, imagePath, caption) {
  const sock = getSock();
  if (!sock) throw new Error('WhatsApp not connected');

  await sock.sendMessage(jid, {
    image: fs.readFileSync(imagePath),
    caption: caption || '',
  });
  logMessage('bot', jid, caption || '[image]', imagePath, 'outgoing');
}

/**
 * Forward media (image/video/document) to a recipient
 */
async function forwardMedia(jid, mediaBuffer, mimetype, caption) {
  const sock = getSock();
  if (!sock) throw new Error('WhatsApp not connected');

  if (mimetype.startsWith('image/')) {
    await sock.sendMessage(jid, { image: mediaBuffer, caption: caption || '' });
  } else if (mimetype.startsWith('video/')) {
    await sock.sendMessage(jid, { video: mediaBuffer, caption: caption || '' });
  } else {
    await sock.sendMessage(jid, {
      document: mediaBuffer,
      mimetype,
      fileName: 'file',
      caption: caption || '',
    });
  }
  logMessage('bot', jid, caption || '[media]', null, 'outgoing');
}

module.exports = { sendText, sendImage, forwardMedia };
