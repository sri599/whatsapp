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
| POST   | /api/auth/login     | Sign in and receive a session    |
| GET    | /api/contacts       | List contacts                    |
| GET    | /api/conversations  | List conversations               |
| POST   | /api/whatsapp/send  | Send a text or media message     |
| POST   | /api/whatsapp/send/bulk | Send to multiple recipients |

## API documentation and testing

- Flutter integration guide and current feature scope: [docs/API.md](docs/API.md)
- Importable Postman collection: [postman/WhatsApp-Integration.postman_collection.json](postman/WhatsApp-Integration.postman_collection.json)

## Send a message

Send requests require `Authorization: Bearer <token>` after signing in.
Configure a WhatsApp Cloud API account through `PUT /api/settings/whatsapp`.
See [docs/API.md](docs/API.md) for role permissions, inbox, media, and bulk
message endpoints.

## Deploy to Render

- Build command: `npm install`
- Start command: `npm start`
- Set the variables from `.env.example` in Render's Environment tab.
- Webhook callback URL: `https://YOUR-APP.onrender.com/webhook/whatsapp`
- Configure the webhook verify token in WhatsApp settings; subscribe to the `messages` field.

## Security notes

- Webhook payloads are validated with `X-Hub-Signature-256` (raw body + App Secret).
- Messages are de-duplicated by `whatsappMessageId`.
- Meta credentials are encrypted in MongoDB using `APP_ENCRYPTION_KEY`.
- Tighten MongoDB Atlas network access when possible.
