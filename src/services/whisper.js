const OpenAI = require('openai');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let openai;
function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: config.openaiApiKey });
  return openai;
}

/**
 * Download voice message from WhatsApp and transcribe using Whisper.
 */
async function transcribeVoiceMessage(msg) {
  // Download the audio from WhatsApp
  const buffer = await downloadMediaMessage(msg, 'buffer', {});

  // Save temporarily
  const tempPath = path.join(__dirname, '../../media', `voice_${Date.now()}.ogg`);
  fs.writeFileSync(tempPath, buffer);

  try {
    // Transcribe with Whisper
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      language: 'ur', // Urdu — Whisper auto-detects if mixed with English
    });

    console.log(`🎤 Transcribed: "${transcription.text}"`);
    return transcription.text;
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

module.exports = { transcribeVoiceMessage };
