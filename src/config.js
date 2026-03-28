require('dotenv').config();

// Support multiple dealer phones (comma-separated in .env)
const phones = (process.env.DEALER_PHONES || process.env.DEALER_PHONE || '').split(',').map(p => p.trim()).filter(Boolean);
const dealerPhones = phones.map(phone => {
  if (phone.includes('@')) return phone;
  return phone.length > 13 ? phone + '@lid' : phone + '@s.whatsapp.net';
});

// First dealer is the primary (receives notifications)
const primaryDealer = dealerPhones[0] || '';

module.exports = {
  dealerPhones,
  primaryDealer,
  isDealer: (jid) => dealerPhones.includes(jid),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  autoSummaryHours: parseInt(process.env.AUTO_SUMMARY_HOURS || '2', 10),
  port: parseInt(process.env.PORT || '3000', 10),
};
