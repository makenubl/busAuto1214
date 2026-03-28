const { sendText, sendTextAndVoice } = require('../bot/sender');
const { handleDealerConversation, generateBroadcastMessage, summarizeResponses } = require('../services/claude');
const { broadcastToSellers } = require('../services/broadcast');
const { textToSpeech } = require('../services/tts');
const {
  createRequest, getDraftRequest, getActiveRequest, closeRequest,
  addContact, removeContact, getAllContacts,
  getResponsesForRequest,
  getAllDealers, removeDealer, addDealer,
  getChatHistory, getProfile, upsertProfile,
  getAvailableInventory, searchInventory, getInventoryById, updateInventoryStatus,
} = require('../db/database');
const { normalizePhone, formatPhoneDisplay } = require('../utils/helpers');
const { getSock } = require('../bot/connection');

/**
 * Smart conversational dealer handler.
 * Claude decides what to do, we execute the action + send voice reply.
 */
async function handleDealerMessage(jid, text) {
  // Get full chat history for dealer (no limit)
  const chatHistory = getChatHistory(jid, 500);

  // Get system state for context
  const activeRequest = getActiveRequest();
  const draftRequest = getDraftRequest();
  const sellers = getAllContacts();
  const dealers = getAllDealers();
  const responseCount = activeRequest ? getResponsesForRequest(activeRequest.id).length : 0;

  const inventory = getAvailableInventory();
  const systemState = {
    activeRequest,
    draftRequest,
    sellerCount: sellers.length,
    dealerCount: dealers.length,
    responseCount,
    inventoryCount: inventory.length,
  };

  // Let Claude handle the conversation
  const result = await handleDealerConversation(text, chatHistory, systemState);
  console.log(`🧠 Dealer action: ${result.action}`);

  // Execute the action
  await executeAction(jid, result.action, result.actionData || {}, result.response);

  // Send response as text + voice
  try {
    const audioBuffer = await textToSpeech(result.response);
    await sendTextAndVoice(jid, result.response, audioBuffer);
  } catch (err) {
    console.error('TTS failed, sending text only:', err.message);
    await sendText(jid, result.response);
  }
}

/**
 * Execute the action decided by Claude.
 */
async function executeAction(jid, action, data, response) {
  switch (action) {
    case 'new_request': {
      const active = getActiveRequest();
      if (active) return; // Claude's response already mentions this

      const parsed = {
        quantity: data.quantity || null,
        type: data.type || null,
        route: data.route || null,
        budget: data.budget || null,
        condition: data.condition || null,
        brand: data.brand || null,
        other: data.other || null,
      };
      createRequest(JSON.stringify(data), parsed);
      break;
    }

    case 'confirm': {
      const draft = getDraftRequest();
      if (draft) {
        const broadcastResult = await broadcastToSellers(draft);
        await sendText(jid, broadcastResult.message);
      }
      break;
    }

    case 'cancel': {
      const draft = getDraftRequest();
      if (draft) closeRequest(draft.id);
      break;
    }

    case 'check_results': {
      const active = getActiveRequest();
      if (active) {
        const responses = getResponsesForRequest(active.id);
        if (responses.length > 0) {
          const contacts = getAllContacts();
          const summary = await summarizeResponses(active, responses, contacts);
          await sendText(jid, summary);
        }
      }
      break;
    }

    case 'detail': {
      const active = getActiveRequest();
      if (!active) break;
      const responses = getResponsesForRequest(active.id);
      const index = parseInt(data.detailNumber) - 1;
      if (isNaN(index) || index < 0 || index >= responses.length) break;

      const r = responses[index];
      const mediaUrls = JSON.parse(r.media_urls || '[]');

      if (mediaUrls.length > 0) {
        const { forwardMedia } = require('../bot/sender');
        const fs = require('fs');
        for (const mediaPath of mediaUrls) {
          try {
            if (fs.existsSync(mediaPath)) {
              const buffer = fs.readFileSync(mediaPath);
              const ext = mediaPath.split('.').pop().toLowerCase();
              const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4' };
              await forwardMedia(jid, buffer, mimeMap[ext] || 'application/octet-stream', '');
            }
          } catch (err) {
            console.error('Media forward failed:', err.message);
          }
        }
      }
      break;
    }

    case 'add_seller': {
      if (data.phone) {
        const phone = normalizePhone(data.phone);
        addContact(phone, data.name || 'نامعلوم', null, null);
      }
      break;
    }

    case 'remove_seller': {
      if (data.phone) {
        const phone = normalizePhone(data.phone);
        removeContact(phone);
      }
      break;
    }

    case 'add_dealer': {
      if (data.phone) {
        const phone = normalizePhone(data.phone);
        const sock = getSock();
        try {
          const [result] = await sock.onWhatsApp(phone.replace('@s.whatsapp.net', ''));
          if (result && result.exists) {
            addDealer(result.jid, data.name || null);
            await sendText(result.jid, '✅ آپ کو میکن موٹرز کے مختار نے ڈیلر کے طور پر شامل کیا ہے۔ "مدد" بھیجیں۔');
          }
        } catch (err) {
          console.error('Add dealer failed:', err.message);
        }
      }
      break;
    }

    case 'close_request': {
      const active = getActiveRequest();
      if (active) closeRequest(active.id);
      break;
    }

    case 'show_inventory': {
      const items = data.searchQuery ? searchInventory(data.searchQuery) : getAvailableInventory();
      if (items.length > 0) {
        let msg = `📦 *دستیاب بسیں (${items.length}):*\n\n`;
        items.forEach((item, i) => {
          const details = JSON.parse(item.parsed_details || '{}');
          const mediaCount = JSON.parse(item.media_paths || '[]').length;
          msg += `${i + 1}. ${item.seller_name} — ${item.description?.substring(0, 80) || 'تفصیلات نہیں'}`;
          if (mediaCount > 0) msg += ` [${mediaCount} تصاویر]`;
          msg += '\n';
        });
        msg += '\n📸 تصاویر دیکھنے کے لیے نمبر بھیجیں۔';
        await sendText(jid, msg);
      }
      break;
    }

    case 'show_inventory_detail': {
      const items = getAvailableInventory();
      const idx = parseInt(data.detailNumber) - 1;
      if (idx >= 0 && idx < items.length) {
        const item = items[idx];
        const mediaPaths = JSON.parse(item.media_paths || '[]');
        if (mediaPaths.length > 0) {
          const { forwardMedia } = require('../bot/sender');
          const fs = require('fs');
          for (const mediaPath of mediaPaths) {
            try {
              if (fs.existsSync(mediaPath)) {
                const buffer = fs.readFileSync(mediaPath);
                const ext = mediaPath.split('.').pop().toLowerCase();
                const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4' };
                await forwardMedia(jid, buffer, mimeMap[ext] || 'application/octet-stream', `${item.seller_name} کی بس`);
              }
            } catch (err) {
              console.error('Media forward failed:', err.message);
            }
          }
        }
      }
      break;
    }

    case 'mark_sold': {
      if (data.inventoryId) {
        updateInventoryStatus(data.inventoryId, 'sold');
      }
      break;
    }

    // greeting, chat, list_sellers, list_dealers, help — response from Claude is enough
    default:
      break;
  }
}

module.exports = { handleDealerMessage };
