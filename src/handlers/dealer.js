const { sendText } = require('../bot/sender');
const { detectIntent, parseRequirement, summarizeResponses } = require('../services/claude');
const { broadcastToSellers } = require('../services/broadcast');
const {
  createRequest, getDraftRequest, getActiveRequest, closeRequest,
  addContact, removeContact, getAllContacts,
  getResponsesForRequest,
} = require('../db/database');
const { normalizePhone, formatPhoneDisplay, isConfirmation, isNegation } = require('../utils/helpers');
const config = require('../config');

/**
 * Handle messages from the dealer.
 */
async function handleDealerMessage(jid, text) {
  // Quick check for simple confirmations/negations before calling Claude
  const draftRequest = getDraftRequest();

  if (draftRequest && isConfirmation(text)) {
    return await handleConfirm(jid, draftRequest);
  }

  if (draftRequest && isNegation(text)) {
    return await handleCancel(jid);
  }

  // Use Claude to detect intent
  const { intent, data } = await detectIntent(text);
  console.log(`🧠 Dealer intent: ${intent}, data: ${data}`);

  switch (intent) {
    case 'new_request':
      return await handleNewRequest(jid, text);
    case 'confirm':
      return await handleConfirm(jid, draftRequest);
    case 'cancel':
      return await handleCancel(jid);
    case 'check_results':
      return await handleCheckResults(jid);
    case 'add_seller':
      return await handleAddSeller(jid, text, data);
    case 'list_sellers':
      return await handleListSellers(jid);
    case 'remove_seller':
      return await handleRemoveSeller(jid, data);
    case 'close_request':
      return await handleCloseRequest(jid);
    case 'detail':
      return await handleDetail(jid, data);
    case 'help':
      return await handleHelp(jid);
    default:
      return await handleNewRequest(jid, text);
  }
}

async function handleNewRequest(jid, text) {
  // Check if there's already an active request
  const active = getActiveRequest();
  if (active) {
    const parsed = JSON.parse(active.parsed || '{}');
    await sendText(jid,
      `⚠️ You already have an active request (#${active.id}).\n` +
      `Send "close" to close it first, or "results" to check responses.`
    );
    return;
  }

  // Parse the requirement
  const parsed = await parseRequirement(text);
  const requestId = createRequest(text, parsed);

  // Build confirmation message
  const details = [];
  if (parsed.quantity) details.push(`• Quantity: ${parsed.quantity}`);
  if (parsed.type) details.push(`• Type: ${parsed.type}`);
  if (parsed.route) details.push(`• Route: ${parsed.route}`);
  if (parsed.budget) details.push(`• Budget: ${parsed.budget}`);
  if (parsed.condition) details.push(`• Condition: ${parsed.condition}`);
  if (parsed.brand) details.push(`• Brand: ${parsed.brand}`);
  if (parsed.other) details.push(`• Other: ${parsed.other}`);

  const sellers = getAllContacts();
  await sendText(jid,
    `📋 *Request #${requestId}*\n\n` +
    `${details.join('\n')}\n\n` +
    `Will send to *${sellers.length} sellers*.\n\n` +
    `Reply *YES* to broadcast, or send corrections.`
  );
}

async function handleConfirm(jid, draftRequest) {
  if (!draftRequest) {
    await sendText(jid, 'No pending request to confirm. Send a new buyer requirement.');
    return;
  }

  await sendText(jid, '📤 Broadcasting to sellers...');
  const result = await broadcastToSellers(draftRequest);
  await sendText(jid, result.message);
}

async function handleCancel(jid) {
  const draft = getDraftRequest();
  if (draft) {
    closeRequest(draft.id);
    await sendText(jid, '❌ Request cancelled.');
  } else {
    await sendText(jid, 'Nothing to cancel.');
  }
}

async function handleCheckResults(jid) {
  const active = getActiveRequest();
  if (!active) {
    await sendText(jid, 'No active request. Send a new buyer requirement to start.');
    return;
  }

  const responses = getResponsesForRequest(active.id);
  if (responses.length === 0) {
    await sendText(jid, `Request #${active.id} — No responses yet. Sellers have been notified.`);
    return;
  }

  const contacts = getAllContacts();
  const summary = await summarizeResponses(active, responses, contacts);
  await sendText(jid, summary);
}

async function handleAddSeller(jid, text, data) {
  // Try to extract phone and name from the message
  const match = text.match(/(\+?[\d]{10,13})\s*(.*)/);
  if (!match && data) {
    const dataMatch = data.match(/(\+?[\d]{10,13})\s*(.*)/);
    if (dataMatch) {
      const phone = normalizePhone(dataMatch[1]);
      const name = dataMatch[2].trim() || 'Unknown';
      addContact(phone, name, null, null);
      await sendText(jid, `✅ Added seller: ${name} (${formatPhoneDisplay(phone)})`);
      return;
    }
  }

  if (match) {
    const phone = normalizePhone(match[1]);
    const name = match[2].trim() || 'Unknown';
    addContact(phone, name, null, null);
    await sendText(jid, `✅ Added seller: ${name} (${formatPhoneDisplay(phone)})`);
  } else {
    await sendText(jid, '❓ Format: add seller <phone> <name>\nExample: add seller 03001234567 Ahmed');
  }
}

async function handleListSellers(jid) {
  const contacts = getAllContacts();
  if (contacts.length === 0) {
    await sendText(jid, 'No sellers added yet.\nUse: add seller <phone> <name>');
    return;
  }

  const list = contacts.map((c, i) =>
    `${i + 1}. ${c.name || 'Unknown'} — ${formatPhoneDisplay(c.phone)}${c.location ? ' (' + c.location + ')' : ''}`
  ).join('\n');

  await sendText(jid, `📒 *Seller Contacts (${contacts.length}):*\n\n${list}`);
}

async function handleRemoveSeller(jid, data) {
  if (!data) {
    await sendText(jid, '❓ Format: remove <phone>\nExample: remove 03001234567');
    return;
  }

  const phone = normalizePhone(data.replace(/[^0-9+]/g, ''));
  const result = removeContact(phone);

  if (result.changes > 0) {
    await sendText(jid, `✅ Removed seller ${formatPhoneDisplay(phone)}`);
  } else {
    await sendText(jid, `❌ Seller ${formatPhoneDisplay(phone)} not found.`);
  }
}

async function handleCloseRequest(jid) {
  const active = getActiveRequest();
  if (active) {
    closeRequest(active.id);
    await sendText(jid, `✅ Request #${active.id} closed.`);
  } else {
    await sendText(jid, 'No active request to close.');
  }
}

async function handleDetail(jid, data) {
  const active = getActiveRequest();
  if (!active) {
    await sendText(jid, 'No active request.');
    return;
  }

  const responses = getResponsesForRequest(active.id);
  const index = parseInt(data) - 1;

  if (isNaN(index) || index < 0 || index >= responses.length) {
    await sendText(jid, `Invalid number. Choose 1 to ${responses.length}.`);
    return;
  }

  const r = responses[index];
  const mediaUrls = JSON.parse(r.media_urls || '[]');

  let detail = `📄 *Details from ${r.seller_name || formatPhoneDisplay(r.seller_phone)}:*\n\n`;
  detail += r.message_text || '(no text)';
  detail += `\n\n📎 ${mediaUrls.length} media file(s)`;

  await sendText(jid, detail);

  // Forward stored media if available
  if (mediaUrls.length > 0) {
    const { forwardMedia } = require('../bot/sender');
    const fs = require('fs');
    for (const mediaPath of mediaUrls) {
      try {
        if (fs.existsSync(mediaPath)) {
          const buffer = fs.readFileSync(mediaPath);
          const ext = mediaPath.split('.').pop().toLowerCase();
          const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', pdf: 'application/pdf' };
          await forwardMedia(jid, buffer, mimeMap[ext] || 'application/octet-stream', '');
        }
      } catch (err) {
        console.error(`Failed to forward media ${mediaPath}:`, err.message);
      }
    }
  }
}

async function handleHelp(jid) {
  await sendText(jid,
    `🚌 *Bus Dealer Assistant*\n\n` +
    `Send me a buyer's requirement (text or voice) and I'll broadcast it to your sellers.\n\n` +
    `*Commands:*\n` +
    `• Send a requirement → I'll parse and confirm\n` +
    `• *YES* → Broadcast to sellers\n` +
    `• *results* → See seller responses\n` +
    `• *1, 2, 3...* → Get full details from a seller\n` +
    `• *close* → Close current request\n` +
    `• *add seller 03xx Name* → Add a seller\n` +
    `• *list sellers* → See all sellers\n` +
    `• *remove 03xx* → Remove a seller\n` +
    `• *help* → Show this message`
  );
}

module.exports = { handleDealerMessage };
