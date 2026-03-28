const { sendText } = require('../bot/sender');
const { detectIntent, parseRequirement, summarizeResponses } = require('../services/claude');
const { broadcastToSellers } = require('../services/broadcast');
const {
  createRequest, getDraftRequest, getActiveRequest, closeRequest,
  addContact, removeContact, getAllContacts,
  getResponsesForRequest,
  createInvite, getAllDealers, removeDealer, addDealer,
} = require('../db/database');
const { normalizePhone, formatPhoneDisplay, isConfirmation, isNegation } = require('../utils/helpers');
const { getSock } = require('../bot/connection');
const config = require('../config');

async function handleDealerMessage(jid, text) {
  const draftRequest = getDraftRequest();

  if (draftRequest && isConfirmation(text)) {
    return await handleConfirm(jid, draftRequest);
  }

  if (draftRequest && isNegation(text)) {
    return await handleCancel(jid);
  }

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
    case 'invite_dealer':
      return await handleInviteDealer(jid, text, data);
    case 'list_dealers':
      return await handleListDealers(jid);
    case 'remove_dealer':
      return await handleRemoveDealer(jid, data);
    case 'help':
      return await handleHelp(jid);
    default:
      return await handleNewRequest(jid, text);
  }
}

async function handleNewRequest(jid, text) {
  const active = getActiveRequest();
  if (active) {
    await sendText(jid,
      `⚠️ آپ کی ایک ریکوئسٹ (#${active.id}) پہلے سے ایکٹو ہے۔\n` +
      `پہلے "بند" بھیجیں یا "نتائج" سے جوابات دیکھیں۔`
    );
    return;
  }

  const parsed = await parseRequirement(text);
  const requestId = createRequest(text, parsed);

  const details = [];
  if (parsed.quantity) details.push(`• تعداد: ${parsed.quantity}`);
  if (parsed.type) details.push(`• قسم: ${parsed.type}`);
  if (parsed.route) details.push(`• روٹ: ${parsed.route}`);
  if (parsed.budget) details.push(`• بجٹ: ${parsed.budget}`);
  if (parsed.condition) details.push(`• حالت: ${parsed.condition}`);
  if (parsed.brand) details.push(`• برانڈ: ${parsed.brand}`);
  if (parsed.other) details.push(`• دیگر: ${parsed.other}`);

  const sellers = getAllContacts();
  await sendText(jid,
    `📋 *ریکوئسٹ نمبر ${requestId}*\n\n` +
    `${details.join('\n')}\n\n` +
    `*${sellers.length} سیلرز* کو بھیجا جائے گا۔\n\n` +
    `تصدیق کے لیے *ہاں* بھیجیں، یا تبدیلی بھیجیں۔`
  );
}

async function handleConfirm(jid, draftRequest) {
  if (!draftRequest) {
    await sendText(jid, 'کوئی زیرِ التوا ریکوئسٹ نہیں ہے۔ نئی ضرورت بھیجیں۔');
    return;
  }

  await sendText(jid, '📤 سیلرز کو بھیجا جا رہا ہے...');
  const result = await broadcastToSellers(draftRequest);
  await sendText(jid, result.message);
}

async function handleCancel(jid) {
  const draft = getDraftRequest();
  if (draft) {
    closeRequest(draft.id);
    await sendText(jid, '❌ ریکوئسٹ منسوخ کر دی گئی۔');
  } else {
    await sendText(jid, 'منسوخ کرنے کے لیے کوئی ریکوئسٹ نہیں ہے۔');
  }
}

async function handleCheckResults(jid) {
  const active = getActiveRequest();
  if (!active) {
    await sendText(jid, 'کوئی ایکٹو ریکوئسٹ نہیں ہے۔ نئی ضرورت بھیجیں۔');
    return;
  }

  const responses = getResponsesForRequest(active.id);
  if (responses.length === 0) {
    await sendText(jid, `ریکوئسٹ #${active.id} — ابھی تک کوئی جواب نہیں آیا۔ سیلرز کو پیغام بھیجا جا چکا ہے۔`);
    return;
  }

  const contacts = getAllContacts();
  const summary = await summarizeResponses(active, responses, contacts);
  await sendText(jid, summary);
}

async function handleAddSeller(jid, text, data) {
  const match = text.match(/(\+?[\d]{10,13})\s*(.*)/);
  if (!match && data) {
    const dataMatch = data.match(/(\+?[\d]{10,13})\s*(.*)/);
    if (dataMatch) {
      const phone = normalizePhone(dataMatch[1]);
      const name = dataMatch[2].trim() || 'نامعلوم';
      addContact(phone, name, null, null);
      await sendText(jid, `✅ سیلر شامل کر دیا گیا: ${name} (${formatPhoneDisplay(phone)})`);
      return;
    }
  }

  if (match) {
    const phone = normalizePhone(match[1]);
    const name = match[2].trim() || 'نامعلوم';
    addContact(phone, name, null, null);
    await sendText(jid, `✅ سیلر شامل کر دیا گیا: ${name} (${formatPhoneDisplay(phone)})`);
  } else {
    await sendText(jid, '❓ طریقہ: سیلر شامل کریں <فون نمبر> <نام>\nمثال: add seller 03001234567 احمد');
  }
}

async function handleListSellers(jid) {
  const contacts = getAllContacts();
  if (contacts.length === 0) {
    await sendText(jid, 'ابھی تک کوئی سیلر شامل نہیں ہے۔\nاستعمال: add seller <فون نمبر> <نام>');
    return;
  }

  const list = contacts.map((c, i) =>
    `${i + 1}. ${c.name || 'نامعلوم'} — ${formatPhoneDisplay(c.phone)}${c.location ? ' (' + c.location + ')' : ''}`
  ).join('\n');

  await sendText(jid, `📒 *سیلرز کی فہرست (${contacts.length}):*\n\n${list}`);
}

async function handleRemoveSeller(jid, data) {
  if (!data) {
    await sendText(jid, '❓ طریقہ: remove <فون نمبر>\nمثال: remove 03001234567');
    return;
  }

  const phone = normalizePhone(data.replace(/[^0-9+]/g, ''));
  const result = removeContact(phone);

  if (result.changes > 0) {
    await sendText(jid, `✅ سیلر ہٹا دیا گیا: ${formatPhoneDisplay(phone)}`);
  } else {
    await sendText(jid, `❌ سیلر ${formatPhoneDisplay(phone)} نہیں ملا۔`);
  }
}

async function handleCloseRequest(jid) {
  const active = getActiveRequest();
  if (active) {
    closeRequest(active.id);
    await sendText(jid, `✅ ریکوئسٹ #${active.id} بند کر دی گئی۔`);
  } else {
    await sendText(jid, 'کوئی ایکٹو ریکوئسٹ نہیں ہے۔');
  }
}

async function handleDetail(jid, data) {
  const active = getActiveRequest();
  if (!active) {
    await sendText(jid, 'کوئی ایکٹو ریکوئسٹ نہیں ہے۔');
    return;
  }

  const responses = getResponsesForRequest(active.id);
  const index = parseInt(data) - 1;

  if (isNaN(index) || index < 0 || index >= responses.length) {
    await sendText(jid, `غلط نمبر۔ 1 سے ${responses.length} تک کا نمبر بھیجیں۔`);
    return;
  }

  const r = responses[index];
  const mediaUrls = JSON.parse(r.media_urls || '[]');

  let detail = `📄 *${r.seller_name || formatPhoneDisplay(r.seller_phone)} کی تفصیلات:*\n\n`;
  detail += r.message_text || '(کوئی متن نہیں)';
  detail += `\n\n📎 ${mediaUrls.length} میڈیا فائل(یں)`;

  await sendText(jid, detail);

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

async function handleInviteDealer(jid, text, data) {
  const source = data || text;
  const match = source.match(/(\+?[\d]{10,13})/);

  if (!match) {
    await sendText(jid, '❓ طریقہ: add dealer 03001234567');
    return;
  }

  const phone = normalizePhone(match[1]);
  const sock = getSock();

  try {
    const [result] = await sock.onWhatsApp(phone.replace('@s.whatsapp.net', ''));

    if (!result || !result.exists) {
      await sendText(jid, `❌ ${formatPhoneDisplay(phone)} واٹس ایپ پر نہیں ہے۔`);
      return;
    }

    const dealerJid = result.jid;
    addDealer(dealerJid, null);

    await sendText(dealerJid, '✅ آپ کو بس ڈیلر اسسٹنٹ میں ڈیلر کے طور پر شامل کر لیا گیا ہے۔ کمانڈز دیکھنے کے لیے "مدد" بھیجیں۔');
    await sendText(jid, `✅ ڈیلر شامل کر دیا گیا: ${formatPhoneDisplay(phone)}`);
  } catch (err) {
    console.error('Failed to add dealer:', err.message);
    await sendText(jid, `❌ ڈیلر شامل نہیں ہو سکا۔ غلطی: ${err.message}`);
  }
}

async function handleListDealers(jid) {
  const dealers = getAllDealers();
  const list = dealers.map((d, i) =>
    `${i + 1}. ${d.name || 'نامعلوم'} — ${d.jid}`
  ).join('\n');
  await sendText(jid, `👤 *ڈیلرز (${dealers.length}):*\n\n${list}`);
}

async function handleRemoveDealer(jid, data) {
  if (!data) {
    await sendText(jid, '❓ طریقہ: remove dealer <نمبر>\nپہلے "list dealers" بھیجیں۔');
    return;
  }

  const dealers = getAllDealers();
  const index = parseInt(data) - 1;

  if (isNaN(index) || index < 0 || index >= dealers.length) {
    await sendText(jid, `غلط نمبر۔ 1 سے ${dealers.length} تک کا نمبر بھیجیں۔`);
    return;
  }

  const target = dealers[index];
  if (target.jid === jid) {
    await sendText(jid, '❌ آپ خود کو نہیں ہٹا سکتے۔');
    return;
  }

  removeDealer(target.jid);
  await sendText(jid, `✅ ڈیلر ہٹا دیا گیا: ${target.name || target.jid}`);
}

async function handleHelp(jid) {
  await sendText(jid,
    `🚌 *میکن — منشی ماکن موٹرز*\n\n` +
    `السلام علیکم! میں میکن ہوں، سردار اختر عباس ماکن کا منشی۔\nخریدار کی ضرورت بھیجیں (ٹیکسٹ یا وائس نوٹ) اور میں آپ کے سیلرز کو بھیج دوں گا۔\n\n` +
    `*کمانڈز:*\n` +
    `• ضرورت بھیجیں → میں سمجھ کر تصدیق کروں گا\n` +
    `• *ہاں* → سیلرز کو بھیجیں\n` +
    `• *نتائج* → سیلرز کے جوابات دیکھیں\n` +
    `• *1، 2، 3...* → کسی سیلر کی مکمل تفصیلات\n` +
    `• *بند* → موجودہ ریکوئسٹ بند کریں\n` +
    `• *add seller 03xx نام* → سیلر شامل کریں\n` +
    `• *list sellers* → سیلرز کی فہرست\n` +
    `• *remove 03xx* → سیلر ہٹائیں\n` +
    `• *add dealer 03xx* → نیا ڈیلر شامل کریں\n` +
    `• *list dealers* → ڈیلرز کی فہرست\n` +
    `• *مدد* → یہ پیغام دکھائیں`
  );
}

module.exports = { handleDealerMessage };
