require('dotenv').config();

// Parse dealer phones from .env for initial seeding
const phones = (process.env.DEALER_PHONES || process.env.DEALER_PHONE || '').split(',').map(p => p.trim()).filter(Boolean);
const envDealerJids = phones.map(phone => {
  if (phone.includes('@')) return phone;
  return phone.length > 13 ? phone + '@lid' : phone + '@s.whatsapp.net';
});

module.exports = {
  envDealerJids,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  autoSummaryHours: parseInt(process.env.AUTO_SUMMARY_HOURS || '2', 10),
  port: parseInt(process.env.PORT || '3000', 10),
};
