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
};
