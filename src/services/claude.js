const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const BOT_NAME = 'مختار';
const DEALER_NAME = 'سردار اختر عباس میکن';
const COMPANY_NAME = 'میکن موٹرز';

async function parseRequirement(text) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `You are ${BOT_NAME}, a bus dealer's assistant for ${COMPANY_NAME}. Parse the following buyer requirement and extract structured information.

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

async function detectIntent(text) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `You are ${BOT_NAME}, a bus dealer's WhatsApp assistant. Classify the following message into one intent.

The message may be in Urdu, Roman Urdu, or English.

Message: "${text}"

Possible intents:
- "greeting" — dealer is greeting (salam, hello, hi, السلام علیکم, assalam o alaikum, kya haal hai)
- "new_request" — dealer is describing a buyer's bus requirement
- "confirm" — dealer is confirming/approving something (yes, haan, bhejo, ok, ہاں)
- "cancel" — dealer is canceling (no, nahi, cancel, ruko, نہیں)
- "check_results" — dealer wants to see seller responses (results, kya mila, show me, نتائج)
- "add_seller" — dealer wants to add a seller contact
- "list_sellers" — dealer wants to see seller list
- "remove_seller" — dealer wants to remove a seller
- "close_request" — dealer wants to close/end the current request (close, بند)
- "invite_dealer" — dealer wants to invite/add a new dealer (add dealer, ڈیلر شامل)
- "list_dealers" — dealer wants to see list of dealers
- "remove_dealer" — dealer wants to remove a dealer
- "help" — dealer wants help or info about commands (help, مدد)
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

async function generateBroadcastMessage(parsed) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are ${BOT_NAME}, munshi of ${DEALER_NAME} from ${COMPANY_NAME}. Generate a polite WhatsApp broadcast message IN URDU to bus sellers asking if they have buses matching these requirements:

${JSON.stringify(parsed)}

The message should:
- Start with "السلام علیکم!"
- Be professional but warm, written entirely in Urdu
- Mention all available details (quantity, type, route, etc.)
- Ask sellers to reply with details, price, and photos
- End with "جزاک اللہ!"
- Be concise (max 3-4 lines)
- Sign off as "${BOT_NAME}، منشی ${COMPANY_NAME}"

Respond with ONLY the message text, no quotes or explanation.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

async function summarizeResponses(request, responses, contacts) {
  const parsed = JSON.parse(request.parsed || '{}');
  const responseDetails = responses.map((r, i) => {
    const mediaCount = JSON.parse(r.media_urls || '[]').length;
    return `سیلر ${i + 1}: ${r.seller_name || r.seller_phone} — "${r.message_text || 'کوئی متن نہیں'}" [${mediaCount} میڈیا فائلز]`;
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `You are ${BOT_NAME}, munshi of ${DEALER_NAME} from ${COMPANY_NAME}. Summarize these seller responses for the dealer IN URDU.

Original requirement: ${JSON.stringify(parsed)}
Total sellers contacted: ${contacts.length}

Seller responses:
${responseDetails.join('\n')}

Sellers who didn't reply: ${contacts.length - responses.length}

Format as a clean WhatsApp message IN URDU:
- Header with request info
- Numbered list of sellers who replied with key details
- Note how many didn't reply
- End with "تفصیلات اور تصاویر کے لیے نمبر بھیجیں (مثلاً 1، 2)۔"

Keep it concise. Respond with ONLY the message text in Urdu.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

async function handlePublicMessage(text, jid, displayPhone, chatHistory, profile) {
  // Format chat history for context
  const historyText = chatHistory.length > 0
    ? chatHistory.map(m => {
        const sender = m.direction === 'incoming' ? displayPhone : 'مختار';
        return `${sender}: ${m.body || '[میڈیا]'}`;
      }).join('\n')
    : 'کوئی پچھلی گفتگو نہیں';

  // Format profile for context
  const profileText = profile
    ? `نام: ${profile.name || 'نامعلوم'}\nکردار: ${profile.role || 'نامعلوم'}\nخلاصہ: ${profile.summary || 'نئی'}\nکل پیغامات: ${profile.total_messages || 0}`
    : 'نیا رابطہ — پہلی بار بات ہو رہی ہے';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `You are ${BOT_NAME} (مختار), the munshi (assistant) of ${DEALER_NAME} from ${COMPANY_NAME}. You handle bus dealing inquiries on WhatsApp.

== اس شخص کی پروفائل ==
${profileText}

== پچھلی گفتگو ==
${historyText}

== نیا پیغام ==
${displayPhone}: "${text}"

Respond naturally IN URDU. You are a professional, warm, and helpful munshi. USE the conversation history to maintain context — refer to previous discussions, remember what they asked before, and build on it.

Rules:
- If they say salam/hello → greet them warmly. If returning contact, welcome them back and reference past interaction
- If they want to BUY buses → ask for details (quantity, type AC/Non-AC, route, budget) and tell them you'll check with your network
- If they want to SELL buses → ask for details (quantity, type, condition, price, photos) and tell them you'll share with interested buyers
- If they ask about availability → tell them to share their requirement and you'll check
- If it's a general question about buses/transport → answer helpfully
- If it's unrelated to buses → politely redirect to bus dealing
- If continuing a previous conversation → pick up where you left off, don't re-introduce yourself

Respond with ONLY a JSON object:
{
  "response": "<your Urdu response text>",
  "type": "<greeting|buying|selling|query|unrelated>",
  "notifyDealer": <true if buying/selling inquiry that dealer should know about>,
  "profileUpdate": {
    "name": "<person's name if mentioned or known, else null>",
    "role": "<buyer|seller|both|unknown>",
    "summary": "<1-2 line Urdu summary of who this person is and what they deal in, based on ALL conversations so far>",
    "tags": ["<relevant tags like bus types, routes, cities>"]
  }
}`,
      },
    ],
  });

  const content = response.content[0].text.trim();
  try {
    return JSON.parse(content);
  } catch {
    return {
      response: 'وعلیکم السلام! میں مختار ہوں، میکن موٹرز کا منشی۔ بتائیں کیا خدمت کر سکتا ہوں؟',
      type: 'greeting',
      notifyDealer: false,
      profileUpdate: null,
    };
  }
}

module.exports = {
  parseRequirement,
  detectIntent,
  generateBroadcastMessage,
  summarizeResponses,
  handlePublicMessage,
};
