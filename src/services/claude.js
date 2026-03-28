const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

const client = new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Parse a buyer requirement from dealer's message.
 * Returns structured JSON.
 */
async function parseRequirement(text) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `You are a bus dealer's assistant. Parse the following buyer requirement and extract structured information.

The message may be in Urdu, Roman Urdu, or English. Extract whatever details are mentioned.

Message: "${text}"

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "quantity": <number or null>,
  "type": <"AC" | "Non-AC" | "Sleeper" | "Luxury" | null>,
  "route": <string or null>,
  "budget": <string or null>,
  "condition": <"new" | "used" | null>,
  "brand": <string or null>,
  "other": <any other details as string or null>
}`,
      },
    ],
  });

  const content = response.content[0].text.trim();
  try {
    return JSON.parse(content);
  } catch {
    return { other: text };
  }
}

/**
 * Detect the dealer's intent from their message.
 */
async function detectIntent(text) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `You are a bus dealer's WhatsApp assistant. Classify the following message into one intent.

The message may be in Urdu, Roman Urdu, or English.

Message: "${text}"

Possible intents:
- "new_request" — dealer is describing a buyer's bus requirement
- "confirm" — dealer is confirming/approving something (yes, haan, bhejo, ok)
- "cancel" — dealer is canceling (no, nahi, cancel, ruko)
- "check_results" — dealer wants to see seller responses (results, kya mila, show me)
- "add_seller" — dealer wants to add a seller contact
- "list_sellers" — dealer wants to see seller list
- "remove_seller" — dealer wants to remove a seller
- "close_request" — dealer wants to close/end the current request
- "invite_dealer" — dealer wants to invite/add a new dealer (add dealer, invite dealer)
- "list_dealers" — dealer wants to see list of dealers
- "remove_dealer" — dealer wants to remove a dealer
- "help" — dealer wants help or info about commands
- "detail" — dealer wants full details of a specific seller response (e.g., "1" or "2")
- "unknown" — none of the above

Respond with ONLY a JSON object (no markdown):
{
  "intent": "<intent>",
  "data": "<any extracted data like phone number for add_seller, or number for detail>"
}`,
      },
    ],
  });

  const content = response.content[0].text.trim();
  try {
    return JSON.parse(content);
  } catch {
    return { intent: 'unknown', data: null };
  }
}

/**
 * Generate a broadcast message for sellers based on parsed requirements.
 */
async function generateBroadcastMessage(parsed) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are a bus dealer's assistant. Generate a polite WhatsApp broadcast message to bus sellers asking if they have buses matching these requirements:

${JSON.stringify(parsed)}

The message should:
- Start with "Assalam o Alaikum!"
- Be professional but warm
- Mention all available details (quantity, type, route, etc.)
- Ask sellers to reply with details, price, and photos
- End with "JazakAllah!"
- Be concise (max 3-4 lines)
- Write in English (sellers understand English)

Respond with ONLY the message text, no quotes or explanation.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

/**
 * Summarize seller responses for the dealer.
 */
async function summarizeResponses(request, responses, contacts) {
  const parsed = JSON.parse(request.parsed || '{}');
  const responseDetails = responses.map((r, i) => {
    const mediaCount = JSON.parse(r.media_urls || '[]').length;
    return `Seller ${i + 1}: ${r.seller_name || r.seller_phone} — "${r.message_text || 'no text'}" [${mediaCount} media files]`;
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `You are a bus dealer's assistant. Summarize these seller responses for the dealer.

Original requirement: ${JSON.stringify(parsed)}
Total sellers contacted: ${contacts.length}

Seller responses:
${responseDetails.join('\n')}

Sellers who didn't reply: ${contacts.length - responses.length}

Format as a clean WhatsApp message:
- Header with request info
- Numbered list of sellers who replied with key details
- Note how many didn't reply
- End with "Reply with a number (e.g. 1, 2) to get full details + photos."

Keep it concise. Respond with ONLY the message text.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

module.exports = {
  parseRequirement,
  detectIntent,
  generateBroadcastMessage,
  summarizeResponses,
};
