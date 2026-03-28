require('dotenv').config();

const phone = process.env.DEALER_PHONE || '';
// Support both traditional (@s.whatsapp.net) and LID (@lid) formats
const dealerPhone = phone.includes('@') ? phone : (phone.length > 13 ? phone + '@lid' : phone + '@s.whatsapp.net');

module.exports = {
  dealerPhone,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  autoSummaryHours: parseInt(process.env.AUTO_SUMMARY_HOURS || '2', 10),
  port: parseInt(process.env.PORT || '3000', 10),
};
