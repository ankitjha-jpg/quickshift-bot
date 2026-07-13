# Quick Shift Pickup Assist — Bot v0.2

WhatsApp bot that checks if a customer is registered, walks them through a pickup
booking, and confirms with a reference ID.

## What's here right now (MVP)
- Customer lookup: `data/crm.json` (fake DB — 2 sample customers)
- Conversation memory: in-memory (resets if server restarts; upgrade to Redis later)
- Booking: mocked (`bookPickup` function generates a fake reference ID)
- WhatsApp connection: built for Twilio's WhatsApp Sandbox

## 1. Push this to GitHub

```bash
cd quickshift-bot
git init
git add .
git commit -m "Initial MVP bot"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(Create the empty repo on GitHub first at github.com/new, then run the commands above.)

## 2. Deploy on Railway

1. Go to railway.app → **New Project** → **Deploy from GitHub repo**.
2. Pick this repo. Railway auto-detects Node.js and installs everything.
3. Once deployed, go to **Settings → Networking → Generate Domain**.
   You'll get a URL like `https://your-app.up.railway.app` — this is your live server.
4. Test it's alive by visiting that URL in a browser — you should see
   "Quick Shift Pickup Assist bot is running."

## 3. Connect WhatsApp (Meta Cloud API — for your existing WhatsApp Business number)

1. Go to developers.facebook.com → create an app → add the **WhatsApp** product.
2. Under **API Setup**, note your **Phone Number ID**.
3. Generate a **permanent access token** (via a System User — not the 24-hr temporary one).
4. In Railway, go to your service → **Variables** tab, and add:
   - `WHATSAPP_TOKEN` = your access token
   - `PHONE_NUMBER_ID` = your phone number ID
   - `WEBHOOK_VERIFY_TOKEN` = any random string you make up (e.g. `qsp-verify-2026`)
5. In Meta's app dashboard → WhatsApp → Configuration → **Webhook**, set:
   - Callback URL: `https://your-app.up.railway.app/webhook`
   - Verify Token: the exact same string you set as `WEBHOOK_VERIFY_TOKEN` in Railway
   - Click **Verify and Save** (Meta calls your server once to confirm it matches)
   - Subscribe to the **messages** webhook field
6. Message your WhatsApp Business number from your phone — you should get real
   replies from the bot.

## 4. Test without WhatsApp (while waiting on Twilio setup)

```bash
curl -X POST https://your-app.up.railway.app/test-message \
  -H "Content-Type: application/json" \
  -d '{"phone":"9876543210","text":"hi"}'
```

Try phone `9876543210` (registered, "Shreyan") or any other number (unregistered).

## Next upgrades (in order of priority)
1. Swap `data/crm.json` for your real customer database
2. Swap in-memory sessions for Redis (so state survives server restarts)
3. Swap `bookPickup()` mock for your real courier/dispatch API
4. Move off Twilio Sandbox to a verified WhatsApp Business number (needed to go live with real customers)
