const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '../../auth_state');
const logger = pino({ level: 'silent' });

let sock = null;
let onMessageCallback = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    // QR handled manually below
    browser: ['BusDealer Bot', 'Chrome', '1.0.0'],
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Connection updates
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed. Status: ${statusCode}. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        console.log('Logged out. Delete auth_state/ folder and restart to re-scan QR code.');
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected successfully!');
    }
  });

  // Incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Skip status broadcasts and our own messages
      if (msg.key.remoteJid === 'status@broadcast') continue;
      if (msg.key.fromMe) continue;

      if (onMessageCallback) {
        try {
          await onMessageCallback(msg);
        } catch (err) {
          console.error('Error handling message:', err);
        }
      }
    }
  });

  return sock;
}

function getSock() {
  return sock;
}

function onMessage(callback) {
  onMessageCallback = callback;
}

module.exports = { connectToWhatsApp, getSock, onMessage };
