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

Context: These are Pakistani bus businessmen who BOTH buy and sell buses. The same person can be a buyer today and a seller tomorrow. They are part of a community of transport businessmen across Pakistan. Treat everyone as a respected member of this business community.

Rules:
- If they say salam/hello → greet them warmly. If returning contact, welcome them back and reference past interaction
- If they want to BUY buses → ask for details (quantity, type AC/Non-AC, route, budget) and tell them you'll check with your network
- If they want to SELL buses → ask for details (quantity, type, condition, price, photos) and tell them you'll share with interested buyers
- Same person can buy AND sell — track both activities in their profile
- If they ask about availability → tell them to share their requirement and you'll check
- If it's a general question about buses/transport → answer helpfully
- If it's unrelated to buses → politely redirect to bus dealing
- If continuing a previous conversation → pick up where you left off, don't re-introduce yourself
- Use their name if you know it from past conversations

Respond with ONLY a JSON object:
{
  "response": "<your Urdu response text>",
  "type": "<greeting|buying|selling|query|unrelated>",
  "notifyDealer": <true if buying/selling inquiry that dealer should know about>,
  "profileUpdate": {
    "name": "<person's name if mentioned or known, else null>",
    "role": "<buyer|seller|businessman — use 'businessman' if they both buy and sell>",
    "summary": "<1-2 line Urdu summary: who they are, what buses they deal in, cities/routes, past deals — build on previous summary, don't replace it>",
    "tags": ["<bus types, routes, cities, brands they deal in>"]
  },
  "inventoryData": <if type is "selling", extract bus details as {"registration_number": "e.g. LEA-1234 or null", "type": "AC/Non-AC", "brand": "Hino/Yutong/etc", "quantity": number, "price": "string", "condition": "new/used", "route": "string", "year": "string"}, else null>
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

/**
 * Smart conversational handler for dealer — replaces rigid intent system.
 * Claude gets full history + system state and decides what to do.
 */
async function handleDealerConversation(text, chatHistory, systemState) {
  const historyText = chatHistory.length > 0
    ? chatHistory.map(m => {
        const sender = m.direction === 'incoming' ? 'ڈیلر' : BOT_NAME;
        return `${sender}: ${m.body || '[میڈیا]'}`;
      }).join('\n')
    : 'نئی گفتگو';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `You are ${BOT_NAME} (مختار), the smart munshi (assistant) of ${DEALER_NAME} from ${COMPANY_NAME}. You are a fully capable AI assistant for a bus dealer on WhatsApp.

You understand Urdu, Punjabi, Roman Urdu, and English. Always respond IN URDU script.

== سسٹم کی حالت ==
ایکٹو ریکوئسٹ: ${systemState.activeRequest ? `#${systemState.activeRequest.id} — ${systemState.activeRequest.parsed}` : 'کوئی نہیں'}
ڈرافٹ ریکوئسٹ: ${systemState.draftRequest ? `#${systemState.draftRequest.id} — ${systemState.draftRequest.parsed}` : 'کوئی نہیں'}
کل سیلرز: ${systemState.sellerCount}
کل ڈیلرز: ${systemState.dealerCount}
ایکٹو ریکوئسٹ کے جوابات: ${systemState.responseCount}
انوینٹری میں دستیاب بسیں: ${systemState.inventoryCount}
${systemState.inventoryList || ''}

== پوری گفتگو ==
${historyText}

== نیا پیغام ==
ڈیلر: "${text}"

You are a smart assistant. Understand what the dealer wants and respond naturally. You can perform these actions:

Actions available:
- "greeting" — just greeting, no action needed
- "new_request" — dealer wants to find buses (extract: quantity, type, route, budget, condition, brand)
- "confirm" — dealer is confirming a pending draft request to broadcast
- "cancel" — dealer is canceling a pending request
- "broadcast" — send requirement to sellers
- "check_results" — dealer wants to see responses from sellers
- "detail" — dealer wants details of a specific seller response (extract number)
- "add_seller" — add seller contact (extract: phone, name)
- "remove_seller" — remove seller (extract: phone)
- "list_sellers" — show seller list
- "add_dealer" — add a new dealer (extract: phone)
- "list_dealers" — show dealer list
- "close_request" — close the active request
- "send_message" — dealer wants to send a message to someone (extract: phone, messageText)
- "send_inventory_to" — dealer wants to send bus details/photos to someone (extract: phone, inventoryId or searchQuery)
- "show_inventory" — dealer wants to see available buses in inventory (extract searchQuery if specific)
- "show_inventory_detail" — dealer wants to see photos/details of specific inventory item (extract detailNumber)
- "mark_sold" — mark a bus as sold (extract inventoryId)
- "help" — show available commands
- "chat" — general conversation, advice, or questions — no system action needed

Respond with ONLY a JSON object:
{
  "response": "<your natural Urdu response — conversational, warm, like a real munshi talking to his boss>",
  "action": "<action from list above>",
  "actionData": {
    "phone": "<if adding seller/dealer>",
    "name": "<if adding seller>",
    "quantity": <if new_request>,
    "type": "<if new_request>",
    "route": "<if new_request>",
    "budget": "<if new_request>",
    "condition": "<if new_request>",
    "brand": "<if new_request>",
    "detailNumber": <if requesting detail of specific seller or inventory item>,
    "messageText": "<text to send if send_message>",
    "searchQuery": "<if searching inventory>",
    "inventoryId": <if marking sold>,
    "registrationNumber": "<bus registration number like LEA-1234 if mentioned>",
    "other": "<any other relevant data>"
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
      response: 'جی سردار صاحب، بتائیں کیا خدمت کر سکتا ہوں؟',
      action: 'chat',
      actionData: {},
    };
  }
}

module.exports = {
  parseRequirement,
  detectIntent,
  generateBroadcastMessage,
  summarizeResponses,
  handlePublicMessage,
  handleDealerConversation,
};
