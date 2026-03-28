require('dotenv').config();

module.exports = {
  dealerPhone: process.env.DEALER_PHONE + '@s.whatsapp.net',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  autoSummaryHours: parseInt(process.env.AUTO_SUMMARY_HOURS || '2', 10),
  port: parseInt(process.env.PORT || '3000', 10),
};
