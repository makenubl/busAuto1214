/**
 * Normalize a phone number to WhatsApp JID format: 923001234567@s.whatsapp.net
 * Handles: +923001234567, 03001234567, 923001234567, etc.
 */
function normalizePhone(input) {
  let digits = input.replace(/[^0-9]/g, '');

  // Remove leading 0 for Pakistani numbers (03xx → 923xx)
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '92' + digits.slice(1);
  }

  // Add 92 if it looks like a 10-digit local number
  if (digits.length === 10 && !digits.startsWith('92')) {
    digits = '92' + digits;
  }

  return digits + '@s.whatsapp.net';
}

/**
 * Extract just the phone digits from a JID
 */
function phoneFromJid(jid) {
  return jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
}

/**
 * Format phone for display: 923001234567 → 0300-1234567
 */
function formatPhoneDisplay(jid) {
  const digits = phoneFromJid(jid);
  if (digits.startsWith('92') && digits.length === 12) {
    const local = '0' + digits.slice(2);
    return local.slice(0, 4) + '-' + local.slice(4);
  }
  return digits;
}

/**
 * Check if a message is a confirmation (yes/haan/bhejo/etc.)
 */
function isConfirmation(text) {
  const confirmWords = ['yes', 'haan', 'han', 'ha', 'bhejo', 'send', 'confirm', 'ok', 'ji', 'theek', 'theek hai'];
  return confirmWords.includes(text.toLowerCase().trim());
}

/**
 * Check if a message is a negation
 */
function isNegation(text) {
  const negWords = ['no', 'nahi', 'nah', 'cancel', 'ruko', 'stop', 'mat'];
  return negWords.includes(text.toLowerCase().trim());
}

module.exports = {
  normalizePhone,
  phoneFromJid,
  formatPhoneDisplay,
  isConfirmation,
  isNegation,
};
