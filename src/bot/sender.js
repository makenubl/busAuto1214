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

/**
 * Send a voice message (audio buffer as ptt)
 */
async function sendVoice(jid, audioBuffer) {
  const sock = getSock();
  if (!sock) throw new Error('WhatsApp not connected');

  // Send as regular audio message (not PTT) — more compatible with MP3
  await sock.sendMessage(jid, {
    audio: audioBuffer,
    mimetype: 'audio/mpeg',
  });
  logMessage('bot', jid, '[voice]', null, 'outgoing');
}

/**
 * Send text + voice note together
 */
async function sendTextAndVoice(jid, text, audioBuffer) {
  await sendText(jid, text);
  if (audioBuffer) {
    await sendVoice(jid, audioBuffer);
  }
}

module.exports = { sendText, sendImage, forwardMedia, sendVoice, sendTextAndVoice };
