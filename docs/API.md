# WhatsApp Integration API

Node.js, Express, and MongoDB backend for a multi-user WhatsApp Cloud API inbox.
Use HTTPS in production. All `/api` endpoints except login require a bearer
session token; Meta alone calls the webhook endpoints.

## Base URL and request conventions

Replace `<base-url>` with the deployed HTTPS origin (for example,
`https://your-service.example.com`). Local development commonly uses
`http://localhost:3000`.

- API paths are case-sensitive. Requests use JSON unless an endpoint says
  `multipart/form-data`.
- Successful API responses generally use `{ "success": true, "data": ... }`.
  Logout returns `{ "success": true }`. Errors generally use
  `{ "success": false, "message": "..." }`.
- Send a login token on protected requests as
  `Authorization: Bearer <token>`.
- Dates are ISO-8601 JSON strings; MongoDB document IDs are ObjectId strings.
- Phone numbers must contain 6-20 digits, including the country calling code,
  with no `+`, spaces, or punctuation (example: `15551234567`). Meta may
  enforce additional recipient rules.

| HTTP status | Meaning |
|---|---|
| `400` | Invalid/missing input, malformed resource ID, unsupported file, or request too large. |
| `401` | Missing/expired/invalid login token, invalid credentials, or invalid webhook signature. |
| `403` | Admin role required, or webhook verification failed. |
| `404` | Unknown route, conversation, user, or WhatsApp settings. |
| `409` | Duplicate email/phone-number ID, or an attempt that would leave no active administrator. |
| `207` | Bulk send had a mixture of successes and failures; inspect each result. |
| `502` | Meta rejected a send, or all bulk sends failed. |
| `500` | Unexpected backend/database error. Internal details are not returned. |

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI`, `ADMIN_EMAIL`,
   `ADMIN_PASSWORD`, and a private `APP_ENCRYPTION_KEY` of at least 32
   characters.
3. Start with `npm run dev`. The first run creates the administrator from the
   bootstrap email/password. Changing those environment values does not reset
   an existing account's password.
4. Sign in, then add WhatsApp Cloud API settings using the settings endpoint.

The API allows cross-origin browser requests from any origin and handles
preflight `OPTIONS` requests. It permits the `Authorization` and `Content-Type`
headers and does not enable cookie credentials. Protected endpoints still
require a bearer token. Do not use cookie-based authentication with this
wildcard CORS policy.

The encryption key protects access tokens, app secrets, and webhook verify
tokens in MongoDB. Back it up securely and keep it stable: losing it makes
stored Meta credentials unreadable. Never send these credentials to a mobile
client except when entering them directly into this backend's authenticated
settings endpoint.

## Roles and sessions

| Role | Permissions |
|---|---|
| `user` | View the user's contacts/conversations, send direct and bulk messages, and manage their own WhatsApp configuration. |
| `admin` | View all inbox data, create/manage accounts, configure any user's WhatsApp integration, and send through a selected user's integration. |

There is no public signup. An administrator creates users through the admin
user endpoints. Passwords require at least 10 characters and are hashed before
storage. Login returns an opaque session token; send it as
`Authorization: Bearer <token>`. Sessions last seven days. Logging out,
deactivating an account, or resetting its password invalidates its sessions.
Keep the token in secure device storage (for example, Keychain/Keystore via a
Flutter secure-storage package), not source code or ordinary preferences. The
backend does not use JWTs or provide token refresh; sign in again after expiry.

## Endpoints

### Service status

#### `GET /`

Public liveness response:
`{ "success": true, "message": "WhatsApp Integration API is running" }`.

#### `GET /health`

Public process-health response includes `success`, `service`, `status`, and
`timestamp`. It only confirms that the HTTP process is responding; it does not
check MongoDB connectivity or Meta credentials.

### Authentication and account management

#### `POST /api/auth/login`

Public. Content-Type: `application/json`.

```json
{ "email": "agent@example.com", "password": "a-long-password" }
```

Returns `{ "success": true, "data": { "token": "...", "expiresAt": "...",
"user": { "id": "...", "name": "...", "email": "...", "role": "user",
"isActive": true } } }`. Invalid credentials and inactive accounts both return
`401` with the same message.

#### `GET /api/auth/me`

Requires authentication. Returns the current account in `data` with `id`,
`name`, `email`, `role`, and `isActive`.

#### `POST /api/auth/logout`

Requires authentication. Deletes the current session and returns
`{ "success": true }`.

#### `GET /api/admin/users`

Admin only. Returns `data` as an array of user summaries, newest first. It
does not return password hashes.

#### `POST /api/admin/users`

Admin only. Creates a user and returns HTTP `201` with the user summary.
Required fields: non-empty `name`, valid-looking `email`, and `password` of at
least 10 characters. `role` is optional and defaults to `user`; allowed values
are `user` and `admin`. Email is trimmed and case-insensitive.

#### `PATCH /api/admin/users/:userId`

Admin only. Send one or more of `name`, `role`, `isActive`, and `password`.
Password must be at least 10 characters; `isActive` must be a JSON boolean.
Password changes and deactivation invalidate the user's sessions.
Deactivation also disables that user's WhatsApp integration. The active admin
cannot deactivate or demote their own account, and the last active admin
cannot be demoted/deactivated. Returns the updated user summary.

### WhatsApp configuration

#### `GET /api/settings/whatsapp`

Requires authentication. A regular user receives their own config or `null` if
none exists. An admin may pass `?userId=<id>` for one user's config; without
that parameter an admin receives all configs, each including its `ownerId`.
Only non-secret identifiers, `isActive`, `credentialsConfigured`, and
`updatedAt` are returned. Secret values are never returned.

#### `PUT /api/settings/whatsapp`

Requires authentication and JSON. Creates or updates the signed-in user's
config. An admin may include `userId` to manage another account's config.
Required fields are strings:

```json
{
  "appId": "meta-app-id",
  "appSecret": "meta-app-secret",
  "accessToken": "whatsapp-cloud-api-token",
  "verifyToken": "webhook-verification-token",
  "businessAccountId": "whatsapp-business-account-id",
  "phoneNumberId": "whatsapp-phone-number-id",
  "graphApiVersion": "v23.0"
}
```

When updating an existing config, `accessToken`, `appSecret`, and `verifyToken`
may be omitted to keep their saved values. All non-secret fields remain
required. `graphApiVersion` accepts a version such as `v23.0` or `23.0`.
`isActive` may optionally be set to a boolean; it defaults to `true` on every
save unless explicitly provided. A phone-number ID must be unique across
accounts. Response data contains public config fields and
`credentialsConfigured: true`, never secret values.

#### `DELETE /api/settings/whatsapp`

Requires authentication. Deactivates the signed-in user's integration. An
admin may include `userId` in the JSON body to deactivate another user's
integration. Existing settings are retained and can be reactivated with PUT.
Returns the public configuration.

### Inbox

All inbox endpoints require authentication. Regular users see only their own
records; admins see records across accounts.

#### `GET /api/contacts?search=<text>`

Returns up to 200 contacts, most recently updated first, in `data`. Optional
`search` is a case-insensitive substring match against `name`, `profileName`,
or `phoneNumber`. The endpoint has no page/offset parameter.

#### `GET /api/conversations?status=open`

Returns up to 200 conversations, most recently active first, in `data`.
`contactId` is populated with the contact object. `status` may be `open` or
`closed`; omit it to include both. An unrecognized status value is ignored.
The endpoint has no page/offset parameter.

#### `GET /api/conversations/:conversationId/messages?limit=50&before=<ISO-date>`

Returns `data` as a chronological array of messages (oldest first within the
page). `limit` defaults to 50 and is clamped to 1-100. `before` is an optional
date; only messages created before it are returned. To load older messages,
send the `createdAt` of the oldest message in the current page as `before`.
This is timestamp-based pagination, so messages sharing the same creation
time may be skipped at a page boundary. An invalid date returns `400`.

#### `PATCH /api/conversations/:conversationId`

Requires JSON `{ "status": "open" }` or `{ "status": "closed" }`. Returns the
updated conversation in `data`. Sending a message only selects or creates an
open conversation; closing one does not block future messages (a new open
conversation may be created for that contact).

### Sending messages

All send endpoints require authentication and use the signed-in user's Meta
configuration. An admin may include `userId` to send through that user's
configuration. Recipients use international-format digits without `+`.
Meta's business-initiated messaging/template and recipient rules still apply.
The API persists a message after Meta accepts the send request. A successful
response does not mean the recipient received or read the message; webhook
status notifications update `status` later.

#### `POST /api/whatsapp/send`

Send a text message to a number:

```json
{ "to": "15551234567", "text": "Hello" }
```

Or send to a conversation:

```json
{ "conversationId": "mongodb-conversation-id", "text": "Hello again" }
```

Use one recipient selector: either `to` or `conversationId`. If both are
provided, `conversationId` takes precedence and `to` is ignored. The
conversation must belong to the authenticated user (admins can access all
conversations). If a conversation is selected, the recipient phone number
comes from its contact.

For file upload, use `multipart/form-data` with one `file` part and optional
`to` or `conversationId`, optional `text` caption, and optional admin `userId`.
The overall file upload limit is 16 MB; images are additionally limited to
5 MB. Accepted MIME types:

- Image: `image/jpeg`, `image/png`.
- Video: `video/mp4`, `video/3gpp`.
- Audio: `audio/aac`, `audio/amr`, `audio/mpeg`, `audio/mp4`, `audio/ogg`.
- Document: PDF, legacy Word/Excel/PowerPoint, OpenXML Word/Excel/PowerPoint,
  ZIP, and plain text.

For a remote file, use JSON with `mediaType` (`image`, `video`, `audio`, or
`document`), `mediaUrl` (HTTPS), optional `fileName` (documents), and optional
`text` caption. The URL must be publicly reachable by Meta. Captions are not
used for audio. Text is limited to 4096 characters; non-empty text or a media
file/URL is required. The outgoing message is saved in conversation history.

On success, `data.whatsapp` is Meta's send response and `data.message` is the
saved backend message. Meta API errors are returned as `502`; input validation
errors are `400`; missing configuration is `400`.

#### `POST /api/whatsapp/send/bulk`

Send one message to 1-100 recipients. JSON example:

```json
{
  "recipients": ["15551234567", "15557654321"],
  "text": "Service update"
}
```

Each recipient is converted to a string and must match the phone number format
described above; clients should send strings to avoid number-formatting
surprises. Duplicates are rejected. Multipart requests use a `recipients` field
containing a JSON-encoded array, plus optional `text` and `file` fields. A
media upload is sent once to Meta and reused for each recipient. Sends run
sequentially; the request may take longer as the recipient count increases.

Response `data` contains `sent`, `failed`, and a `results` array. Each result
contains `to`, `success`, and either the saved `message` or an `error` from
Meta. HTTP `200` means all succeeded, `207` means partial success, and `502`
means all failed. Top-level `success` is true only when every send succeeds.
Check recipient consent and applicable Meta messaging rules before sending.

### Meta webhook

#### `GET /webhook/whatsapp`

Public Meta verification endpoint. Meta supplies `hub.mode`,
`hub.verify_token`, and `hub.challenge` as query parameters. For mode
`subscribe` and an active matching verify token, the API responds `200` with
the challenge as plain text; otherwise it responds `403`. Configure this
callback URL and matching verify token in Meta's webhook settings.

#### `POST /webhook/whatsapp`

Public endpoint for Meta only. The raw JSON request body is checked against
`X-Hub-Signature-256` using active configured app secrets. A missing/invalid
signature returns `401`. The API returns `200` after processing succeeds;
processing errors return `500` so Meta can retry. Incoming contacts,
conversations, and messages are stored under the account matching the
payload's `phone_number_id`. Repeated inbound message IDs are ignored.
Delivery/read/failure notifications update a stored message status. Subscribe
to the `messages` field.

The backend stores inbound media IDs but does not currently expose an endpoint
to download/proxy media. A Flutter client cannot fetch an image/audio/document
through this API; implement a secured media-download endpoint before expecting
the inbox to display inbound media.

### Health

See `GET /health` above. An unknown URL returns
`404 { "success": false, "message": "Route not found" }`.

## Data model

- **User summary:** `id`, `name`, `email`, `role` (`user` or `admin`),
  `isActive`.
- **Contact:** `_id`, `ownerId`, `whatsappUserId`, `phoneNumber`, `name`,
  `profileName`, `createdAt`, and `updatedAt`.
- **Conversation:** `_id`, `ownerId`, `contactId` (contact object in the
  conversation-list response), `whatsappPhoneNumberId`, `status` (`open` or
  `closed`), `lastMessageAt`, `createdAt`, and `updatedAt`.
- **Message:** `_id`, `conversationId`, `whatsappMessageId`, `direction`
  (`incoming` or `outgoing`), `messageType`, `messageText`, `mediaId`,
  `mediaUrl`, `status` (`received`, `sent`, `delivered`, `read`, or `failed`),
  `whatsappTimestamp`, optional `error`, `createdAt`, and `updatedAt`.
  Fields without a value may be `null`.

The API returns MongoDB documents, so document IDs use `_id` in inbox/message
data (the user-summary response uses `id`). Flutter parsing models should
accept nullable message/contact fields and preserve unknown message types.

Example message shape from a conversation's messages endpoint:

```json
{
  "_id": "665000000000000000000001",
  "conversationId": "665000000000000000000002",
  "whatsappMessageId": "wamid.example",
  "direction": "incoming",
  "messageType": "text",
  "messageText": "Hello",
  "mediaId": null,
  "mediaUrl": null,
  "status": "received",
  "whatsappTimestamp": "2026-01-15T10:20:30.000Z",
  "error": null,
  "createdAt": "2026-01-15T10:20:31.000Z",
  "updatedAt": "2026-01-15T10:20:31.000Z"
}
```

Conversation-list responses have the same envelope with `data` as an array.
Each conversation's `contactId` is a populated contact document (not just an
ID); a contact's useful display fields are `profileName`, `name`, and
`phoneNumber`.

## Flutter notes

Flutter calls this backend, never the Meta Graph API directly. Store session
tokens securely on-device; do not bundle Meta secrets in the app. A Meta
webhook cannot reach a private localhost address; configure a public HTTPS
deployment or secure development tunnel. There is no WebSocket/SSE endpoint:
refresh or poll the conversation/message endpoints to receive updates.

Minimal login, conversation-list, and send-text example using `package:http`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class WhatsAppApi {
  WhatsAppApi(this.baseUrl);

  final String baseUrl; // e.g. https://your-service.example.com
  String? token; // Persist this with secure device storage in the app.

  Future<void> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'Login failed');
    }
    token = body['data']['token'] as String;
  }

  Future<Map<String, dynamic>> getConversations({String? status}) async {
    final uri = Uri.parse('$baseUrl/api/conversations').replace(
      queryParameters: status == null ? null : {'status': status},
    );
    final response = await http.get(uri, headers: {
      'Authorization': 'Bearer $token',
    });
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'Could not load conversations');
    }
    return body;
  }

  Future<Map<String, dynamic>> sendText(String to, String text) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/whatsapp/send'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'to': to, 'text': text}),
    );
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode != 200) {
      throw Exception(body['message'] ?? 'Message could not be sent');
    }
    return body['data'] as Map<String, dynamic>;
  }
}
```

For file sending, use `http.MultipartRequest` at `/api/whatsapp/send`, set its
bearer `Authorization` header, add the file using field name `file`, and add
`to` or `conversationId` plus optional `text` as string fields. For bulk media,
pass `recipients` as a JSON-encoded string. Always handle non-2xx statuses and
inspect the per-recipient `results` for bulk sends. Do not treat HTTP `200`
from the send endpoint as delivery confirmation; check the message status
after webhook updates are processed.
