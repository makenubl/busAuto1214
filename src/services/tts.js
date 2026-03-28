const OpenAI = require('openai');
const config = require('../config');
const path = require('path');
const fs = require('fs');

let openai;
function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: config.openaiApiKey });
  return openai;
}

/**
 * Convert text to speech using OpenAI TTS API.
 * Returns a Buffer of the audio file (mp3).
 */
async function textToSpeech(text) {
  const response = await getOpenAI().audio.speech.create({
    model: 'tts-1',
    voice: 'onyx', // Deep male voice — fits Mukhtar persona
    input: text,
    response_format: 'opus', // Opus format works best for WhatsApp voice notes
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
}

module.exports = { textToSpeech };
