const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/bus_dealer.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);
  }
  return db;
}

// --- Contacts ---

function addContact(phone, name, location, notes) {
  const db = getDb();
  return db.prepare(
    'INSERT OR IGNORE INTO contacts (phone, name, location, notes) VALUES (?, ?, ?, ?)'
  ).run(phone, name, location, notes);
}

function removeContact(phone) {
  const db = getDb();
  return db.prepare('DELETE FROM contacts WHERE phone = ?').run(phone);
}

function getAllContacts() {
  const db = getDb();
  return db.prepare('SELECT * FROM contacts ORDER BY name').all();
}

function getContactByPhone(phone) {
  const db = getDb();
  return db.prepare('SELECT * FROM contacts WHERE phone = ?').get(phone);
}

// --- Requests ---

function createRequest(rawMessage, parsed) {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO requests (raw_message, parsed, status) VALUES (?, ?, ?)'
  ).run(rawMessage, JSON.stringify(parsed), 'draft');
  return result.lastInsertRowid;
}

function activateRequest(id) {
  const db = getDb();
  return db.prepare("UPDATE requests SET status = 'active' WHERE id = ?").run(id);
}

function closeRequest(id) {
  const db = getDb();
  return db.prepare(
    "UPDATE requests SET status = 'closed', closed_at = datetime('now') WHERE id = ?"
  ).run(id);
}

function getActiveRequest() {
  const db = getDb();
  return db.prepare("SELECT * FROM requests WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").get();
}

function getDraftRequest() {
  const db = getDb();
  return db.prepare("SELECT * FROM requests WHERE status = 'draft' ORDER BY created_at DESC LIMIT 1").get();
}

function getRequestById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
}

// --- Responses ---

function addResponse(requestId, sellerPhone, messageText, mediaUrls) {
  const db = getDb();
  return db.prepare(
    'INSERT INTO responses (request_id, seller_phone, message_text, media_urls) VALUES (?, ?, ?, ?)'
  ).run(requestId, sellerPhone, messageText, JSON.stringify(mediaUrls || []));
}

function getResponsesForRequest(requestId) {
  const db = getDb();
  return db.prepare(
    'SELECT r.*, c.name as seller_name FROM responses r LEFT JOIN contacts c ON r.seller_phone = c.phone WHERE r.request_id = ? ORDER BY r.received_at'
  ).all(requestId);
}

// --- Dealers ---

function addDealer(jid, name) {
  const db = getDb();
  return db.prepare('INSERT OR IGNORE INTO dealers (jid, name) VALUES (?, ?)').run(jid, name);
}

function removeDealer(jid) {
  const db = getDb();
  return db.prepare('DELETE FROM dealers WHERE jid = ?').run(jid);
}

function isDealer(jid) {
  const db = getDb();
  return !!db.prepare('SELECT 1 FROM dealers WHERE jid = ?').get(jid);
}

function getAllDealers() {
  const db = getDb();
  return db.prepare('SELECT * FROM dealers ORDER BY added_at').all();
}

// --- Dealer Invites ---

function createInvite(createdBy) {
  const db = getDb();
  const code = 'JOIN-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare('INSERT INTO dealer_invites (code, created_by, expires_at) VALUES (?, ?, ?)').run(code, createdBy, expiresAt);
  return code;
}

function useInvite(code) {
  const db = getDb();
  const invite = db.prepare("SELECT * FROM dealer_invites WHERE code = ? AND used = 0 AND expires_at > datetime('now')").get(code);
  if (invite) {
    db.prepare('UPDATE dealer_invites SET used = 1 WHERE code = ?').run(code);
    return invite;
  }
  return null;
}

// --- Seed Dealers from .env ---

function seedDealersFromEnv(dealerJids) {
  for (const jid of dealerJids) {
    addDealer(jid, null);
  }
}

// --- Messages Log ---

function logMessage(sender, recipient, body, mediaUrl, direction) {
  const db = getDb();
  return db.prepare(
    'INSERT INTO messages_log (sender, recipient, body, media_url, direction) VALUES (?, ?, ?, ?, ?)'
  ).run(sender, recipient, body, mediaUrl, direction);
}

module.exports = {
  getDb,
  addContact,
  removeContact,
  getAllContacts,
  getContactByPhone,
  createRequest,
  activateRequest,
  closeRequest,
  getActiveRequest,
  getDraftRequest,
  getRequestById,
  addResponse,
  getResponsesForRequest,
  logMessage,
  addDealer,
  removeDealer,
  isDealer,
  getAllDealers,
  createInvite,
  useInvite,
  seedDealersFromEnv,
};
