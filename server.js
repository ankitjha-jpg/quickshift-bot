require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ---------- "CRM" lookup (swap for a real DB later) ----------
const CRM_PATH = path.join(__dirname, 'data', 'crm.json');
function lookupCustomer(phone) {
  const crm = JSON.parse(fs.readFileSync(CRM_PATH, 'utf8'));
  return crm[phone] || null;
}

// ---------- In-memory conversation state (swap for Redis later) ----------
// Structure: { "<phone>": { stage: "awaiting_template", customer: {...}, expiresAt: <timestamp> } }
const sessions = {};
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours, matches diagram's TTL clear

function getSession(phone) {
  const s = sessions[phone];
  if (s && Date.now() < s.expiresAt) return s;
  if (s) delete sessions[phone]; // expired, clear it
  return null;
}
function setSession(phone, data) {
  sessions[phone] = { ...data, expiresAt: Date.now() + SESSION_TTL_MS };
}
function clearSession(phone) {
  delete sessions[phone];
}

// ---------- Simple leads log for unregistered numbers ----------
const LEADS_PATH = path.join(__dirname, 'data', 'leads.json');
function logLead(phone) {
  let leads = [];
  if (fs.existsSync(LEADS_PATH)) leads = JSON.parse(fs.readFileSync(LEADS_PATH, 'utf8'));
  leads.push({ phone, at: new Date().toISOString() });
  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2));
}

// ---------- Field extraction + validation ----------
function parseTemplate(text) {
  const addressMatch = text.match(/ADDRESS\s*-\s*(.+)/i);
  const boxesMatch = text.match(/BOXES\s*-\s*(\d+)/i);
  const pincodeMatch = text.match(/PINCODE\s*-\s*(\d{6})/i);

  return {
    address: addressMatch ? addressMatch[1].trim().split('\n')[0] : null,
    boxes: boxesMatch ? boxesMatch[1].trim() : null,
    pincode: pincodeMatch ? pincodeMatch[1].trim() : null,
  };
}
function isValid(fields) {
  return !!(fields.address && fields.boxes && fields.pincode);
}

// ---------- Mock allocation engine (swap for real courier API later) ----------
function bookPickup(fields, customer) {
  const refId = 'PK-' + Math.floor(1000 + Math.random() * 9000);
  const courier = 'FedEx';
  return { refId, courier };
}

// ---------- Message templates ----------
const TEMPLATE_TEXT =
  'To book your pickup, please reply in this exact format:\n\n' +
  'ADDRESS - <your pickup address>\n' +
  'BOXES - <number of boxes>\n' +
  'PINCODE - <6-digit pincode>';

function greeting(customer) {
  return `Hi ${customer.name} from ${customer.client}! 👋\n\n${TEMPLATE_TEXT}`;
}

// ---------- Core bot logic (used by both webhook and test route) ----------
function handleIncomingMessage(phone, text) {
  const customer = lookupCustomer(phone);

  // UNREGISTERED PATH
  if (!customer) {
    logLead(phone);
    return 'Welcome! Your number isn\'t registered yet. Please contact our sales team and we\'ll get you set up.';
  }

  // REGISTERED PATH
  const session = getSession(phone);

  if (!session) {
    // First message from this (known) customer in this window
    setSession(phone, { stage: 'awaiting_template', customer });
    return greeting(customer);
  }

  if (session.stage === 'awaiting_template') {
    const fields = parseTemplate(text);

    if (!isValid(fields)) {
      return `Sorry, that reply is missing some details.\n\n${TEMPLATE_TEXT}`;
    }

    const { refId, courier } = bookPickup(fields, customer);
    clearSession(phone); // done, clear state
    return `✅ Pickup scheduled!\nReference ID: ${refId}\nCourier: ${courier}`;
  }

  // Fallback: anything else after booking is complete -> support loop
  return 'Thanks for your message. Our operations team will follow up shortly.';
}

// ---------- WhatsApp webhook (Twilio format) ----------
// Twilio sends incoming WhatsApp messages as POST with "From" and "Body" fields.
app.post('/webhook', (req, res) => {
  const from = (req.body.From || '').replace('whatsapp:+', ''); // e.g. "919876543210"
  const body = req.body.Body || '';

  // Normalize to last 10 digits to match our mock CRM keys
  const phone = from.slice(-10);

  const replyText = handleIncomingMessage(phone, body);

  // Respond in Twilio's expected TwiML format
  res.set('Content-Type', 'text/xml');
  res.send(`<Response><Message>${escapeXml(replyText)}</Message></Response>`);
});

function escapeXml(str) {
  return str.replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
  }[c]));
}

// ---------- Test route (no WhatsApp needed, for local/dev testing) ----------
// POST { "phone": "9876543210", "text": "hi" }
app.post('/test-message', (req, res) => {
  const { phone, text } = req.body;
  if (!phone || !text) return res.status(400).json({ error: 'phone and text are required' });
  const reply = handleIncomingMessage(phone, text);
  res.json({ reply });
});

app.get('/', (req, res) => {
  res.send('Quick Shift Pickup Assist bot is running.');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
