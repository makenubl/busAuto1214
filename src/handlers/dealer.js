const { sendText, sendTextAndVoice } = require('../bot/sender');
const { handleDealerConversation, generateBroadcastMessage, summarizeResponses } = require('../services/claude');
const { broadcastToSellers } = require('../services/broadcast');
const { textToSpeech } = require('../services/tts');
const {
  createRequest, getDraftRequest, getActiveRequest, closeRequest,
  addContact, removeContact, getAllContacts,
  getResponsesForRequest,
  getAllDealers, removeDealer, addDealer,
  getChatHistory, getProfile, upsertProfile, getAllProfiles,
  getAvailableInventory, searchInventory, getInventoryById, getInventoryByRegNumber, updateInventoryStatus,
  createDeal, updateDealStatus, addDealNote, getActiveDeals, getDealById, getTodaySummary,
} = require('../db/database');
const { normalizePhone, formatPhoneDisplay } = require('../utils/helpers');
const { getSock } = require('../bot/connection');
const COMPANY_NAME = 'میکن موٹرز';

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
  let inventoryList = '';
  if (inventory.length > 0) {
    inventoryList = '\n== انوینٹری کی تفصیلات ==\n' + inventory.map((item, i) => {
      const details = JSON.parse(item.parsed_details || '{}');
      const mediaCount = JSON.parse(item.media_paths || '[]').length;
      const regNo = item.registration_number ? `[${item.registration_number}]` : '[رجسٹریشن نمبر نہیں]';
      return `${i + 1}. ${regNo} ${item.seller_name} — ${item.description?.substring(0, 100) || 'تفصیلات نہیں'} | تصاویر: ${mediaCount}`;
    }).join('\n');
  }

  const activeDeals = getActiveDeals();
  let dealsList = '';
  if (activeDeals.length > 0) {
    dealsList = '\n== ایکٹو ڈیلز ==\n' + activeDeals.map((d, i) =>
      `${i + 1}. [ڈیل #${d.id}] ${d.buyer_name || '?'} ← ${d.seller_name || '?'} | ${d.bus_registration || 'بس نمبر نہیں'} | حالت: ${d.status} | قیمت: ${d.agreed_price || '?'}`
    ).join('\n');
  }

  const systemState = {
    activeRequest,
    draftRequest,
    sellerCount: sellers.length,
    dealerCount: dealers.length,
    responseCount,
    inventoryCount: inventory.length,
    activeDealsCount: activeDeals.length,
    inventoryList,
    dealsList,
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

    case 'send_message': {
      if (data.phone && data.messageText) {
        const phone = normalizePhone(data.phone);
        try {
          await sendText(phone, data.messageText);
          console.log(`📤 Message sent to ${phone} on dealer's behalf`);
        } catch (err) {
          console.error('Send message failed:', err.message);
        }
      }
      break;
    }

    case 'send_inventory_to': {
      if (data.phone) {
        const phone = normalizePhone(data.phone);
        let items = [];

        // Specific inventory item by ID or registration number
        if (data.inventoryId) {
          const item = getInventoryById(data.inventoryId);
          if (item) items = [item];
        } else if (data.registrationNumber) {
          const item = getInventoryByRegNumber(data.registrationNumber);
          if (item) items = [item];
        }
        // By list number (1, 2, 3...)
        else if (data.detailNumber) {
          const allItems = getAvailableInventory();
          const idx = parseInt(data.detailNumber) - 1;
          if (idx >= 0 && idx < allItems.length) items = [allItems[idx]];
        }
        // By search
        else if (data.searchQuery) {
          items = searchInventory(data.searchQuery);
        }
        // All
        else {
          items = getAvailableInventory().slice(0, 5);
        }

        if (items.length > 0) {
          for (const item of items) {
            await sendText(phone, `السلام علیکم! ${COMPANY_NAME} کی طرف سے۔\n\n${item.description || 'بس دستیاب ہے'}\n\nمزید معلومات کے لیے رابطہ کریں۔`);

            // Send photos
            const { forwardMedia } = require('../bot/sender');
            const fs = require('fs');
            const mediaPaths = JSON.parse(item.media_paths || '[]');
            for (const mediaPath of mediaPaths) {
              try {
                if (fs.existsSync(mediaPath)) {
                  const buffer = fs.readFileSync(mediaPath);
                  const ext = mediaPath.split('.').pop().toLowerCase();
                  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4' };
                  await forwardMedia(phone, buffer, mimeMap[ext] || 'application/octet-stream', '');
                }
              } catch (err) {
                console.error('Media forward failed:', err.message);
              }
            }
          }
        }
      }
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

    case 'create_deal': {
      const dealId = createDeal({
        buyer_name: data.buyer_name,
        seller_name: data.seller_name,
        bus_registration: data.bus_registration || data.registrationNumber,
        description: data.description,
        agreed_price: data.agreed_price,
        status: data.newStatus || 'inquiry',
      });
      console.log(`📝 Deal #${dealId} created`);
      break;
    }

    case 'update_deal': {
      if (data.dealId) {
        if (data.newStatus) updateDealStatus(data.dealId, data.newStatus);
        if (data.note) addDealNote(data.dealId, data.note);
      }
      break;
    }

    case 'show_deals': {
      const deals = getActiveDeals();
      if (deals.length > 0) {
        let msg = `📝 *ایکٹو ڈیلز (${deals.length}):*\n\n`;
        deals.forEach((d, i) => {
          msg += `${i + 1}. ${d.buyer_name || '?'} ← ${d.seller_name || '?'}\n`;
          msg += `   بس: ${d.bus_registration || '?'} | حالت: ${d.status}\n`;
          if (d.agreed_price) msg += `   قیمت: ${d.agreed_price}\n`;
          msg += '\n';
        });
        await sendText(jid, msg);
      }
      break;
    }

    case 'summary': {
      const stats = getTodaySummary();
      const summaryMsg =
        `📊 *آج کا خلاصہ:*\n\n` +
        `📩 نئے پیغامات: ${stats.newMessages}\n` +
        `📦 نئی بسیں انوینٹری میں: ${stats.newInventory}\n` +
        `📝 ایکٹو ڈیلز: ${stats.activeDeals}\n` +
        `🔍 ایکٹو ریکوئسٹس: ${stats.activeRequests}\n` +
        `👥 کل سیلرز: ${stats.totalSellers}\n` +
        `🚌 کل دستیاب بسیں: ${stats.totalInventory}`;
      await sendText(jid, summaryMsg);
      break;
    }

    case 'save_note': {
      if (data.phone && data.noteText) {
        const phone = normalizePhone(data.phone);
        const profile = getProfile(phone);
        const existingSummary = profile?.summary || '';
        upsertProfile(phone, {
          summary: existingSummary ? `${existingSummary} | ${data.noteText}` : data.noteText,
          phone_display: formatPhoneDisplay(phone),
        });
      } else if (data.name && data.noteText) {
        // Save note by name — search profiles
        // For now just log it
        console.log(`📝 Note about ${data.name}: ${data.noteText}`);
      }
      break;
    }

    // greeting, chat, followup, list_sellers, list_dealers, help — response from Claude is enough
    default:
      break;
  }
}

module.exports = { handleDealerMessage };
