# WhatsApp Web.js API Server

A comprehensive Node.js REST API server built with Express.js and WhatsApp Web.js that provides programmatic access to WhatsApp messaging functionality. This server enables sending messages, media, locations, interactive buttons, and lists through a secure HTTPS API with webhook support for real-time event notifications.

## Features

### Core Messaging Capabilities
- **Text Messages**: Send plain text messages to contacts and groups
- **Media Messages**: Send images, videos, documents, and audio files
- **Location Sharing**: Send location data with custom names and addresses
- **Interactive Elements**: Send buttons and list messages for user interaction
- **Chat Management**: Retrieve and manage chat conversations

### Advanced Features
- **Webhook Integration**: Real-time event notifications for incoming messages, delivery receipts, and status changes
- **HTTPS Security**: SSL/TLS encryption with certificate-based authentication
- **API Key Authentication**: Secure access control using custom API keys
- **Session Management**: Persistent WhatsApp sessions with automatic reconnection
- **Client Management**: Logout, disconnect, and reconnect functionality
- **File Upload Support**: Multer integration for media file handling

### Real-time Events
- QR code generation for authentication
- Message delivery acknowledgments
- Incoming message notifications
- Client status changes
- Connection state monitoring

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn package manager
- SSL certificates (for HTTPS)
- WhatsApp account for authentication

## Installation

1. **Clone or download the project files**

2. **Install dependencies**
   ```bash
   npm install express whatsapp-web.js qrcode multer axios dotenv
   ```

3. **Set up SSL certificates**
   Create an `ssl` directory in your project root and add:
   - `key.pem` - Private key file
   - `cert.pem` - Certificate file  
   - `cacert.pem` - Certificate Authority file

4. **Configure environment variables**
   Create a `.env` file in your project root:
   ```env
   PORT=3004
   API_KEY=your-secure-api-key-here
   WEBHOOK_URL=https://your-webhook-endpoint.com/webhook
   ```

5. **Create required directories**
   ```bash
   mkdir uploads sessions ssl
   ```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port number | No | 3004 |
| `API_KEY` | Authentication key for API access | Yes | - |
| `WEBHOOK_URL` | URL for webhook notifications | No | - |

### SSL Configuration

Place your SSL certificate files in the `ssl` directory:
- `ssl/key.pem` - Server private key
- `ssl/cert.pem` - Server certificate
- `ssl/cacert.pem` - Certificate authority certificate

## Usage

### Starting the Server

```bash
node app.js
```

The server will start on `https://localhost:3004` (or your configured port).

### Authentication Process

1. **Start the server** - The WhatsApp client will initialize
2. **Get QR code** - Visit `https://localhost:3004/qr-code` 
3. **Scan QR code** - Use WhatsApp mobile app to scan the QR code
4. **Client ready** - Server will log "WhatsApp Client is READY!" when authenticated

## API Endpoints

### Authentication & Status

#### Get QR Code
```http
GET /qr-code
```
Returns a PNG image of the QR code for WhatsApp authentication. No API key required.

#### Get Client Status
```http
GET /status
Headers: x-api-key: your-api-key
```
Returns current client status and webhook configuration.

#### Get Client Info
```http
GET /client-info
Headers: x-api-key: your-api-key
```
Returns detailed information about the authenticated WhatsApp client.

### Messaging

#### Send Text Message
```http
POST /send-message
Headers: 
  Content-Type: application/json
  x-api-key: your-api-key

Body:
{
    "number": "5511999999999",
    "message": "Hello from API!"
}
```

#### Send Media
```http
POST /send-media
Headers: x-api-key: your-api-key
Content-Type: multipart/form-data

Form Data:
- number: 5511999999999
- caption: Optional caption text
- file: [media file]
```

#### Send Location
```http
POST /send-location
Headers: 
  Content-Type: application/json
  x-api-key: your-api-key

Body:
{
    "number": "5511999999999",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "name": "Location Name",
    "address": "Full Address"
}
```

#### Send Interactive Buttons
```http
POST /send-buttons
Headers: 
  Content-Type: application/json
  x-api-key: your-api-key

Body:
{
    "number": "5511999999999",
    "body": "Please select an option:",
    "buttons": [
        {"id": "btn1", "body": "Option 1"},
        {"id": "btn2", "body": "Option 2"}
    ],
    "title": "Select Option",
    "footer": "Company Name"
}
```

#### Send Interactive List
```http
POST /send-list
Headers: 
  Content-Type: application/json
  x-api-key: your-api-key

Body:
{
    "number": "5511999999999",
    "body": "Please select from the list:",
    "buttonText": "View Options",
    "sections": [
        {
            "title": "Section 1",
            "rows": [
                {"id": "row1", "title": "Item 1", "description": "Description"}
            ]
        }
    ],
    "title": "Options List",
    "footer": "Company Name"
}
```

#### Get Chats
```http
GET /chats
Headers: x-api-key: your-api-key
```
Returns a list of all chat conversations.

### Webhook Management

#### Set Webhook URL
```http
POST /set-webhook
Headers: 
  Content-Type: application/json
  x-api-key: your-api-key

Body:
{
    "url": "https://your-webhook-endpoint.com/webhook"
}
```

#### Remove Webhook URL
```http
DELETE /remove-webhook
Headers: x-api-key: your-api-key
```

### Client Management

#### Logout
```http
POST /logout
Headers: x-api-key: your-api-key
```
Clears session data and requires QR scan for next connection.

#### Disconnect
```http
POST /disconnect
Headers: x-api-key: your-api-key
```
Closes connection but preserves session data.

#### Reconnect
```http
POST /reconnect
Headers: x-api-key: your-api-key
```
Attempts to reconnect using existing session data.

## Phone Number Formats

The API accepts phone numbers in various formats:

- **Individual contacts**: `5511999999999` (automatically formatted to `5511999999999@c.us`)
- **Groups**: `5511999999999-1234567890@g.us` (groups contain hyphens)
- **Full format**: Numbers already containing `@c.us` or `@g.us` are used as-is

## Webhook Events

When a webhook URL is configured, the server sends POST requests for the following events:

### Event Types

| Event | Description |
|-------|-------------|
| `qr_received` | QR code is ready for scanning |
| `authenticated` | Client successfully authenticated |
| `ready` | Client is ready to send/receive messages |
| `auth_failure` | Authentication failed |
| `disconnected` | Client disconnected |
| `state_change` | Client state changed |
| `loading_screen` | Loading progress updates |
| `message_received` | Incoming message received |
| `message_ack` | Message delivery status updated |

### Webhook Payload Structure

```json
{
    "event": "message_received",
    "data": {
        "id": "message_id",
        "from": "5511999999999@c.us",
        "to": "your_number@c.us",
        "body": "Message text",
        "type": "chat",
        "timestamp": 1640995200,
        "fromMe": false,
        "hasMedia": false
    },
    "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Message Acknowledgment Status

| ACK Value | Status | Description |
|-----------|--------|-------------|
| -1 | ERROR | Message failed to send |
| 0 | PENDING | Message queued on device |
| 1 | SENT | Message sent to WhatsApp servers |
| 2 | RECEIVED | Message delivered to recipient |
| 3 | READ | Message read by recipient |
| 4 | PLAYED | Audio/video message played |

## Client Status Values

| Status | Description |
|--------|-------------|
| `INITIALIZING` | Client is starting up |
| `QR_RECEIVED` | QR code available for scanning |
| `AUTHENTICATED` | Successfully authenticated |
| `READY` | Client ready for messaging |
| `AUTH_FAILURE` | Authentication failed |
| `DISCONNECTED` | Client disconnected |
| `SHUTTING_DOWN` | Server shutting down |

## Error Handling

The API returns standard HTTP status codes:

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (invalid API key)
- `404` - Not Found (resource unavailable)
- `409` - Conflict (client not ready)
- `500` - Internal Server Error

Error responses include details:
```json
{
    "status": "error",
    "message": "Error description",
    "details": "Additional error information"
}
```

## Security Considerations

- **HTTPS Only**: All communication is encrypted using SSL/TLS
- **API Key Authentication**: All endpoints (except QR code) require valid API key
- **File Upload Limits**: Media uploads limited to 50MB
- **Input Validation**: Phone numbers and parameters are validated
- **Session Isolation**: Each server instance maintains separate WhatsApp sessions

## Postman Collection

A complete Postman collection is available with pre-configured requests for all endpoints. Import the collection and set the following variables:

- `base_url`: `https://localhost:3004`
- `api_key`: Your configured API key

## Troubleshooting

### Common Issues

**QR Code Not Displaying**
- Ensure SSL certificates are properly configured
- Check that the server started without SSL errors
- Verify the client status shows `QR_RECEIVED`

**Authentication Failures**
- Clear the `sessions` directory and restart
- Ensure your WhatsApp account isn't logged in elsewhere
- Check for network connectivity issues

**Message Sending Fails**
- Verify client status is `READY`
- Check phone number format
- Ensure recipient number exists on WhatsApp

**Webhook Not Receiving Events**
- Verify webhook URL is accessible from the server
- Check webhook endpoint accepts POST requests
- Ensure webhook URL uses HTTPS

### Logs and Monitoring

The server provides detailed console logging for:
- Client status changes
- Message sending/receiving
- Webhook delivery attempts
- Error conditions

Monitor the console output for real-time status updates and troubleshooting information.

## Contributing

When contributing to this project:

1. Maintain the existing code structure and error handling patterns
2. Add appropriate logging for new features
3. Update this README for any new endpoints or functionality
4. Test all changes with the provided Postman collection

## License

This project uses the WhatsApp Web.js library and should comply with WhatsApp's Terms of Service. Use responsibly and ensure compliance with applicable regulations regarding automated messaging.