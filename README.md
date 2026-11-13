# WhatsApp Integration

Node.js + Express + MongoDB Atlas + WhatsApp Cloud API. Deployable to Render.

## Quick start

1. `npm install`
2. Fill in `.env` (never commit it).
3. `npm run dev`
4. Open http://localhost:3000/health

## Endpoints

| Method | Path                | Purpose                          |
|--------|---------------------|----------------------------------|
| GET    | /health             | Health check                     |
| GET    | /webhook/whatsapp   | Meta webhook verification        |
| POST   | /webhook/whatsapp   | Incoming messages/status updates |
| POST   | /api/whatsapp/send  | Send a text message              |

## Send a message

POST /api/whatsapp/send

    { "to": "919XXXXXXXXX", "text": "Hello", "conversationId": "optional" }

## Deploy to Render

- Build command: `npm install`
- Start command: `npm start`
- Add every variable from `.env.example` in Render's Environment tab.
- Webhook callback URL: `https://YOUR-APP.onrender.com/webhook/whatsapp`
- Verify token must equal `WHATSAPP_VERIFY_TOKEN`; subscribe to the `messages` field.

## Security notes

- Webhook payloads are validated with `X-Hub-Signature-256` (raw body + App Secret).
- Messages are de-duplicated by `whatsappMessageId`.
- `POST /api/whatsapp/send` is currently unauthenticated: add an API key or auth before production.
- Tighten MongoDB Atlas network access when possible.
