const OpenAI = require('openai');
const config = require('../config');

let openai;
function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: config.openaiApiKey });
  return openai;
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'kLuXkg0zRFuSas1JFmMT'; // Sohaib Jasra — natural Hindi/Urdu male

/**
 * Convert text to speech using ElevenLabs (primary) or OpenAI (fallback).
 * Returns a Buffer of audio in opus format.
 */
async function textToSpeech(text) {
  // Try ElevenLabs first (much more natural for Urdu)
  if (ELEVENLABS_API_KEY) {
    try {
      return await elevenLabsTTS(text);
    } catch (err) {
      console.error('ElevenLabs TTS failed, falling back to OpenAI:', err.message);
    }
  }

  // Fallback to OpenAI
  return await openaiTTS(text);
}

/**
 * ElevenLabs TTS — natural multilingual voice
 */
async function elevenLabsTTS(text) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${error}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`🔊 ElevenLabs TTS: ${buffer.length} bytes`);
  return buffer;
}

/**
 * OpenAI TTS — fallback
 */
async function openaiTTS(text) {
  const response = await getOpenAI().audio.speech.create({
    model: 'tts-1-hd',
    voice: 'ash',
    input: text,
    response_format: 'opus',
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`🔊 OpenAI TTS: ${buffer.length} bytes`);
  return buffer;
}

module.exports = { textToSpeech };
