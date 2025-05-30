require('dotenv').config(); // Load .env file variables
const express = require('express');
const https = require('https');
const http = require('http'); // Keep commented unless needed
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth, MessageMedia, Location, Buttons, List } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const multer = require('multer');
const axios = require('axios'); // For sending webhooks

const app = express();
const port = process.env.PORT || 3004;
const apiKey = process.env.API_KEY;

if (!apiKey) {
    console.error("FATAL ERROR: API_KEY is not defined in the environment variables (.env file). Please set it.");
    process.exit(1); // Exit if API key is not set
}

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Useful for form data if needed

// API Key Authentication Middleware
const authenticateApiKey = (req, res, next) => {
    const providedApiKey = req.headers['x-api-key'];
    if (!providedApiKey || providedApiKey !== apiKey) {
        console.warn(`Authentication failed: Invalid or missing API Key from ${req.ip}`);
        return res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid or missing API Key' });
    }
    next();
};

// Apply API Key Auth to all routes except /qr-code (optional, adjust as needed)
// If you want QR code to be public, keep it outside `app.use(authenticateApiKey)`
// If QR should also be protected, move the /qr-code route below this line.
// app.use(authenticateApiKey); // Apply to all subsequent routes

// --- Multer Configuration ---
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        // Sanitize filename if needed, or use a unique ID
        // For simplicity, using originalname - BE CAREFUL OF FILENAME COLLISIONS OR MALICIOUS NAMES
        cb(null, file.originalname);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // Example: 50MB limit
});

// --- SSL Configuration ---
const sslOptions = {};
try {
    sslOptions.key = fs.readFileSync(path.join(__dirname, 'ssl', 'key.pem'));
    sslOptions.cert = fs.readFileSync(path.join(__dirname, 'ssl', 'cert.pem'));
    // CA is often needed for browsers/clients to trust your self-signed cert if applicable
    sslOptions.ca = fs.readFileSync(path.join(__dirname, 'ssl', 'cacert.pem'));
} catch (e) {
    console.error("-------------------------------------------------------");
    console.error("SSL Error: Could not load SSL certificate files.");
    console.error("Ensure 'key.pem', 'cert.pem', and 'cacert.pem' exist in the 'ssl' directory.");
    console.error("Error details:", e.message);
    console.error("SERVER WILL NOT START WITH HTTPS.");
    console.error("-------------------------------------------------------");
    // Decide how to handle this: exit, or maybe try HTTP (less secure)
    process.exit(1); // Exit if SSL files are mandatory and missing
}


// --- WhatsApp Client Setup ---
let whatsappStatus = 'INITIALIZING'; // Track client status
let qrCodeData = null;
let webhookUrl = process.env.WEBHOOK_URL || null; // Load initial webhook from .env if set

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: "sessions" }), // Store session data in 'sessions' folder
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Often needed in Docker/Linux environments
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Optional: might reduce memory usage
            '--disable-gpu' // Optional: might reduce memory usage
        ],
        // Optional: Specify chromium path if needed
        // executablePath: '/usr/bin/google-chrome-stable'
    },
    // Increase timeout for QR scan and initial connection
    qrTimeout: 60000, // 60 seconds
    authTimeoutMs: 90000, // 90 seconds
});

console.log('Initializing WhatsApp client...');
whatsappStatus = 'INITIALIZING';

client.on('qr', (qr) => {
    qrCodeData = qr;
    whatsappStatus = 'QR_RECEIVED';
    console.log(`QR RECEIVED (${new Date().toLocaleTimeString()}): Scan the QR code to log in.`);
    // Optionally send QR via webhook if needed (e.g., for a dashboard)
    sendWebhook('qr_received', { qrCodeDataUrl: `https://localhost:${port}/qr-code` }) // Use your actual domain/IP
      .catch(err => console.error("Webhook Error (QR):", err.message));
});

client.on('ready', () => {
    qrCodeData = null;
    whatsappStatus = 'READY';
    console.log(`WhatsApp Client is READY! (${new Date().toLocaleTimeString()})`);
    console.log(`Connected as: ${client.info.pushname} (${client.info.wid.user})`);
    sendWebhook('ready', { info: client.info })
      .catch(err => console.error("Webhook Error (Ready):", err.message));
});

client.on('authenticated', () => {
    qrCodeData = null; // Should already be null from 'ready', but just in case
    whatsappStatus = 'AUTHENTICATED'; // Might briefly pass through here before 'ready'
    console.log(`WhatsApp Client AUTHENTICATED (${new Date().toLocaleTimeString()})`);
    sendWebhook('authenticated', { info: client.info })
       .catch(err => console.error("Webhook Error (Authenticated):", err.message));
});

client.on('auth_failure', (msg) => {
    whatsappStatus = 'AUTH_FAILURE';
    console.error(`AUTHENTICATION FAILURE (${new Date().toLocaleTimeString()}):`, msg);
    // Critical error: Session might be invalid. Consider clearing session data or alerting admin.
    // No automatic re-initialization here, requires manual intervention or restart.
    qrCodeData = null;
    sendWebhook('auth_failure', { message: msg })
       .catch(err => console.error("Webhook Error (Auth Failure):", err.message));
});

client.on('disconnected', (reason) => {
    whatsappStatus = 'DISCONNECTED';
    console.warn(`WhatsApp Client DISCONNECTED (${new Date().toLocaleTimeString()}):`, reason);
    qrCodeData = null;
    // Attempt to re-initialize after a delay
    sendWebhook('disconnected', { reason: reason })
       .catch(err => console.error("Webhook Error (Disconnected):", err.message));
    console.log('Attempting to reconnect in 30 seconds...');
    setTimeout(() => {
        if (whatsappStatus === 'DISCONNECTED') { // Only initialize if still disconnected
            console.log('Re-initializing client...');
            client.initialize().catch(err => console.error("Error during re-initialization:", err));
            whatsappStatus = 'INITIALIZING';
        }
    }, 30000); // 30-second delay
});

client.on('change_state', state => {
    console.log(`CLIENT STATE CHANGED: ${state} (${new Date().toLocaleTimeString()})`);
    // You could map internal library states to your `whatsappStatus` if needed
    sendWebhook('state_change', { state })
       .catch(err => console.error("Webhook Error (State Change):", err.message));
});

client.on('loading_screen', (percent, message) => {
    console.log(`LOADING: ${percent}% - ${message} (${new Date().toLocaleTimeString()})`);
     sendWebhook('loading_screen', { percent, message })
       .catch(err => console.error("Webhook Error (Loading):", err.message));
});

// --- Webhook Functionality ---

// Function to safely send data to the webhook URL
async function sendWebhook(eventType, data) {
    if (!webhookUrl) {
        // console.log(`Webhook URL not set, skipping webhook for event: ${eventType}`);
        return;
    }

    console.log(`Sending webhook for event: ${eventType}`);
    try {
        const payload = {
            event: eventType,
            data: data,
            timestamp: new Date().toISOString(),
        };
        await axios.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000 // 10 second timeout for webhook request
        });
        console.log(`Webhook sent successfully for event: ${eventType}`);
    } catch (error) {
        console.error(`Error sending webhook for event ${eventType}:`, error.message);
        // Handle specific errors if needed (e.g., ECONNREFUSED, timeout)
        if (error.response) {
            console.error("Webhook response status:", error.response.status);
            // console.error("Webhook response data:", error.response.data);
        }
    }
}

// Listen for incoming messages and forward to webhook
client.on('message_create', async (message) => {
    // message.type values: chat, image, video, ptt (audio), document, location, vcard, sticker, etc.
    console.log(`Incoming message from ${message.from}: (${message.type})`);
    // IMPORTANT: Avoid processing messages sent by the bot itself if reacting to own messages causes loops
    if (message.fromMe) {
        // console.log("Ignoring message from self.");
        // return; // Uncomment if you don't want webhooks for outgoing messages triggered here
    }

    // Prepare data for webhook - include relevant message properties
    // Avoid sending overly large objects if possible
    const messageData = {
        id: message.id._serialized,
        from: message.from,
        to: message.to,
        body: message.body,
        type: message.type,
        timestamp: message.timestamp,
        fromMe: message.fromMe,
        hasMedia: message.hasMedia,
        // Add more fields as needed, e.g., location details, vcard info
    };

    // If it has media, add info but maybe not the raw data unless necessary
    if (message.hasMedia) {
        try {
            // Downloading media can be slow/resource-intensive. Only do it if the webhook receiver needs it.
            // For now, just indicate media is present. Let receiver request download via API if needed.
            // const media = await message.downloadMedia();
            // messageData.mediaInfo = {
            //     mimetype: media.mimetype,
            //     filename: media.filename,
            //     filesize: media.filesize,
            //     // data: media.data // Avoid sending raw base64 data in webhook unless small/required
            // };
            messageData.mediaInfo = { mimetype: message.mimetype, filename: message.filename }; // Basic info
        } catch (mediaError) {
            console.error("Error getting media info for webhook:", mediaError);
            messageData.mediaInfo = { error: "Could not retrieve media details" };
        }
    }

    sendWebhook('message_received', messageData)
        .catch(err => console.error("Webhook Error (Message Received):", err.message));

    // Optional: Add auto-reply or processing logic here if needed
    // if (message.body === '!ping') {
    //     await message.reply('pong');
    // }
});

// Listen for message Acknowledgement changes and forward to webhook
client.on('message_ack', (message, ack) => {
    /*
        ACK Values:
        -1 = ERROR (e.g., message failed to send)
         0 = PENDING (in queue on device)
         1 = SENT (server received)
         2 = RECEIVED (recipient received)
         3 = READ (recipient read)
         4 = PLAYED (recipient played audio/video) - Not always reliable
    */
    const ackMap = { '-1': 'ERROR', 0: 'PENDING', 1: 'SENT', 2: 'RECEIVED', 3: 'READ', 4: 'PLAYED' };
    console.log(`Message ACK Updated: ID=${message.id._serialized}, To=${message.to}, ACK=${ack} (${ackMap[ack] || 'UNKNOWN'})`);

    sendWebhook('message_ack', {
        id: message.id._serialized,
        from: message.from,
        to: message.to,
        ack: ack,
        ackStatus: ackMap[ack] || 'UNKNOWN',
        timestamp: Date.now() // Ack timestamp isn't directly on the object, use current time
    }).catch(err => console.error("Webhook Error (Message ACK):", err.message));
});


// --- API Routes ---

// --- Public Routes (No API Key needed - Adjust placement if protection needed) ---

// QR Code Route (Public by default)
app.get('/qr-code', async (req, res) => {
    if (whatsappStatus === 'QR_RECEIVED' && qrCodeData) {
        try {
            const qrImage = await qrcode.toDataURL(qrCodeData);
            const img = Buffer.from(qrImage.split(',')[1], 'base64');
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': img.length
            });
            res.end(img);
        } catch (error) {
            console.error("Failed to generate QR code image:", error);
            res.status(500).json({ status: 'error', message: 'Failed to generate QR code image' });
        }
    } else if (whatsappStatus === 'READY' || whatsappStatus === 'AUTHENTICATED') {
         res.status(200).json({ status: 'success', message: 'Client is already authenticated and ready.' });
    }
     else {
        res.status(404).json({ status: 'error', message: 'QR code not currently available', currentStatus: whatsappStatus });
    }
});

// --- Protected Routes (Require API Key) ---
app.use(authenticateApiKey); // Apply Auth middleware from here onwards

// Get Client Status
app.get('/status', (req, res) => {
    const info = client.info; // Get current info if available
    res.status(200).json({
        status: 'success',
        whatsapp: {
            status: whatsappStatus,
            since: new Date().toISOString(), // Or track state change time more accurately
            info: (whatsappStatus === 'READY' || whatsappStatus === 'AUTHENTICATED') ? info : null
        },
        webhook: {
            configured: !!webhookUrl,
            url: webhookUrl // Show configured URL (optional, might be sensitive)
        }
    });
});

// Get Client Info (more detailed than status)
app.get('/client-info', (req, res) => {
    if (whatsappStatus === 'READY' || whatsappStatus === 'AUTHENTICATED') {
        res.status(200).json({ status: 'success', info: client.info });
    } else {
        res.status(404).json({ status: 'error', message: 'Client info not available', currentStatus: whatsappStatus });
    }
});

// Send Text Message
app.post('/send-message', async (req, res) => {
    if (whatsappStatus !== 'READY') {
        return res.status(409).json({ status: 'error', message: `Client not ready (Status: ${whatsappStatus})` });
    }
    const { number, message, options } = req.body; // options can include mentions, etc.

    if (!number || !message) {
        return res.status(400).json({ status: 'error', message: 'Missing "number" or "message" in request body' });
    }

    // Basic validation/formatting (can be more robust)
    const formattedNumber = number.includes('@c.us') || number.includes('@g.us')
        ? number
        : number.includes('-')
            ? `${number}@g.us` // Assume group if contains hyphen
            : `${number}@c.us`; // Assume chat otherwise

    try {
        console.log(`Sending message to ${formattedNumber}...`);
        const response = await client.sendMessage(formattedNumber, message, options || {});
        console.log(`Message sent successfully to ${formattedNumber}. ID: ${response.id._serialized}`);
        res.status(200).json({ status: 'success', message: 'Message sent successfully', response: response });
    } catch (error) {
        console.error(`Failed to send message to ${formattedNumber}:`, error);
        res.status(500).json({ status: 'error', message: 'Failed to send message', details: error.message || error });
    }
});

// Send Media Message (Image, Video, Document, Audio)
app.post('/send-media', upload.single('file'), async (req, res) => {
     if (whatsappStatus !== 'READY') {
        return res.status(409).json({ status: 'error', message: `Client not ready (Status: ${whatsappStatus})` });
    }
    const { number, caption } = req.body;
    const file = req.file;

    if (!number || !file) {
         // Clean up uploaded file if validation fails early
        if (file) {
            fs.unlink(file.path, (err) => {
                if (err) console.error('Error deleting uploaded file after validation failure:', err);
            });
        }
        return res.status(400).json({ status: 'error', message: 'Missing "number" or "file" in request' });
    }

    const formattedNumber = number.includes('@c.us') || number.includes('@g.us') ? number : `${number}@c.us`;
    const filePath = file.path;

    try {
        console.log(`Sending media from ${filePath} to ${formattedNumber} with caption "${caption || ''}"...`);
        const media = MessageMedia.fromFilePath(filePath);
        const options = { caption: caption || '' };
        // Add more options if needed: sendAsDocument, sendAudioAsVoice (ptt), etc.
        // if (req.body.sendAsDocument === 'true') options.sendAsDocument = true;
        // if (req.body.sendAudioAsVoice === 'true') options.ptt = true; // For audio files

        const response = await client.sendMessage(formattedNumber, media, options);
        console.log(`Media sent successfully to ${formattedNumber}. ID: ${response.id._serialized}`);
        res.status(200).json({ status: 'success', message: 'Media sent successfully', response: response });
    } catch (error) {
        console.error(`Failed to send media to ${formattedNumber}:`, error);
        res.status(500).json({ status: 'error', message: 'Failed to send media', details: error.message || error });
    } finally {
        // Delete the temporary uploaded file
        fs.unlink(filePath, (err) => {
            if (err) console.error('Failed to delete uploaded media file:', filePath, err);
            else console.log('Deleted temporary file:', filePath);
        });
    }
});

// Send Location Message
app.post('/send-location', async (req, res) => {
     if (whatsappStatus !== 'READY') {
        return res.status(409).json({ status: 'error', message: `Client not ready (Status: ${whatsappStatus})` });
    }
    const { number, latitude, longitude, name, address } = req.body;

    if (!number || !latitude || !longitude) {
        return res.status(400).json({ status: 'error', message: 'Missing "number", "latitude", or "longitude"' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lon)) {
         return res.status(400).json({ status: 'error', message: 'Invalid "latitude" or "longitude"' });
    }

    const formattedNumber = number.includes('@c.us') || number.includes('@g.us') ? number : `${number}@c.us`;

    try {
        console.log(`Sending location (${lat}, ${lon}) to ${formattedNumber}...`);
        const location = new Location(lat, lon, { name: name || '', address: address || '' });
        const response = await client.sendMessage(formattedNumber, location);
        console.log(`Location sent successfully to ${formattedNumber}. ID: ${response.id._serialized}`);
        res.status(200).json({ status: 'success', message: 'Location sent successfully', response: response });
    } catch (error) {
        console.error(`Failed to send location to ${formattedNumber}:`, error);
        res.status(500).json({ status: 'error', message: 'Failed to send location', details: error.message || error });
    }
});

// Send Buttons Message (Example)
app.post('/send-buttons', async (req, res) => {
     if (whatsappStatus !== 'READY') {
        return res.status(409).json({ status: 'error', message: `Client not ready (Status: ${whatsappStatus})` });
    }
    const { number, body, buttons, title, footer } = req.body;
    // buttons should be an array like: [{id: 'customId1', body: 'Button 1'}, {id: 'customId2', body: 'Button 2'}]

    if (!number || !body || !Array.isArray(buttons) || buttons.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Missing number, body, or valid buttons array' });
    }

    const formattedNumber = number.includes('@c.us') || number.includes('@g.us') ? number : `${number}@c.us`;

    try {
        console.log(`Sending buttons to ${formattedNumber}...`);
        const buttonsPayload = new Buttons(body, buttons, title, footer);
        const response = await client.sendMessage(formattedNumber, buttonsPayload);
        console.log(`Buttons sent successfully to ${formattedNumber}. ID: ${response.id._serialized}`);
        res.status(200).json({ status: 'success', message: 'Buttons sent successfully', response });
    } catch (error) {
        console.error(`Failed to send buttons to ${formattedNumber}:`, error);
        res.status(500).json({ status: 'error', message: 'Failed to send buttons', details: error.message || error });
    }
});

// Send List Message (Example)
app.post('/send-list', async (req, res) => {
    if (whatsappStatus !== 'READY') {
        return res.status(409).json({ status: 'error', message: `Client not ready (Status: ${whatsappStatus})` });
    }
    const { number, body, buttonText, sections, title, footer } = req.body;
    // sections should be an array like: [{title: 'Section 1', rows: [{id: 'row1', title: 'Row 1 Title', description: 'Optional desc'}, {id: 'row2', title: 'Row 2 Title'}]}]

    if (!number || !body || !buttonText || !Array.isArray(sections) || sections.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Missing number, body, buttonText, or valid sections array' });
    }

    const formattedNumber = number.includes('@c.us') || number.includes('@g.us') ? number : `${number}@c.us`;

    try {
        console.log(`Sending list to ${formattedNumber}...`);
        const listPayload = new List(body, buttonText, sections, title, footer);
        const response = await client.sendMessage(formattedNumber, listPayload);
        console.log(`List sent successfully to ${formattedNumber}. ID: ${response.id._serialized}`);
        res.status(200).json({ status: 'success', message: 'List sent successfully', response });
    } catch (error) {
        console.error(`Failed to send list to ${formattedNumber}:`, error);
        res.status(500).json({ status: 'error', message: 'Failed to send list', details: error.message || error });
    }
});


// Get List of Chats
app.get('/chats', async (req, res) => {
     if (whatsappStatus !== 'READY') {
        return res.status(409).json({ status: 'error', message: `Client not ready (Status: ${whatsappStatus})` });
    }
    try {
        const chats = await client.getChats();
        // Optionally filter/map the data before sending
        const chatList = chats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            timestamp: chat.timestamp,
            unreadCount: chat.unreadCount,
        }));
        res.status(200).json({ status: 'success', count: chatList.length, chats: chatList });
    } catch (error) {
        console.error('Failed to retrieve chats:', error);
        res.status(500).json({ status: 'error', message: 'Failed to retrieve chats', details: error.message || error });
    }
});

// --- Webhook Configuration Routes ---

// Set Webhook URL
app.post('/set-webhook', (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return res.status(400).json({ status: 'error', message: 'Invalid or missing "url" in request body. Must be a valid HTTP/HTTPS URL.' });
    }
    webhookUrl = url;
    console.log(`Webhook URL set to: ${webhookUrl}`);
    res.status(200).json({ status: 'success', message: 'Webhook URL updated successfully.', webhookUrl: webhookUrl });
    // Optionally save to .env or config file here for persistence across restarts
});

// Remove Webhook URL
app.delete('/remove-webhook', (req, res) => {
    if (!webhookUrl) {
        return res.status(404).json({ status: 'error', message: 'Webhook URL is not currently set.' });
    }
    console.log(`Removing webhook URL: ${webhookUrl}`);
    webhookUrl = null;
    res.status(200).json({ status: 'success', message: 'Webhook URL removed.' });
});

// --- Client Management Routes ---

// Logout (Clears session, requires QR scan again)
app.post('/logout', async (req, res) => {
    console.log('Attempting to logout client...');
    try {
        await client.logout();
        whatsappStatus = 'DISCONNECTED'; // Or maybe a 'LOGGED_OUT' status
        qrCodeData = null;
        console.log('Client logged out successfully.');
        res.status(200).json({ status: 'success', message: 'Logged out successfully. Session data cleared. Requires QR scan on next init.' });
    } catch (error) {
        console.error('Failed to log out:', error);
        res.status(500).json({ status: 'error', message: 'Failed to log out', details: error.message || error });
    }
});

// Disconnect (Closes connection, session data kept for faster reconnect)
app.post('/disconnect', async (req, res) => {
    console.log('Attempting to disconnect client (destroy)...');
    try {
        await client.destroy(); // Closes connection but keeps session
        whatsappStatus = 'DISCONNECTED';
        qrCodeData = null;
        console.log('Client disconnected (destroyed) successfully.');
        res.status(200).json({ status: 'success', message: 'Client connection closed. Session data preserved.' });
    } catch (error) {
        console.error('Failed to disconnect (destroy):', error);
        res.status(500).json({ status: 'error', message: 'Failed to disconnect', details: error.message || error });
    }
});

// Reconnect (Initialize the client again)
app.post('/reconnect', async (req, res) => {
    if (whatsappStatus === 'READY' || whatsappStatus === 'AUTHENTICATED' || whatsappStatus === 'INITIALIZING') {
         return res.status(400).json({ status: 'error', message: `Client is already ${whatsappStatus}. Use /disconnect first if needed.` });
    }
    console.log('Attempting to reconnect (initialize) client...');
    try {
        whatsappStatus = 'INITIALIZING';
        qrCodeData = null;
        await client.initialize();
        // Status will be updated by the event listeners ('qr', 'ready', etc.)
        res.status(202).json({ status: 'success', message: 'Client initialization triggered. Monitor /status or logs.' });
    } catch (error) {
        whatsappStatus = 'AUTH_FAILURE'; // Or other appropriate error state
        console.error('Failed to initialize client:', error);
        res.status(500).json({ status: 'error', message: 'Failed to initialize client', details: error.message || error });
    }
});


// --- Start Server ---
// const server = https.createServer(sslOptions, app);

// Optional HTTP redirect (uncomment if needed, less secure)
const server = http.createServer((req, res) => {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(httpPort, () => {
    console.log(`HTTP server running on port ${httpPort}, redirecting to HTTPS`);
});

server.listen(port, () => {
    console.log(`HTTPS server running securely on https://localhost:${port}`);
    console.log(`API Key Authentication: ${apiKey ? 'ENABLED' : 'DISABLED (WARNING!)'}`);
    console.log(`Webhook URL: ${webhookUrl || 'Not Set'}`);
    console.log('Initializing WhatsApp client connection...');
    client.initialize().catch(err => {
        console.error("FATAL: Initial client initialization failed:", err);
        whatsappStatus = 'AUTH_FAILURE'; // Or a generic 'ERROR' state
        // Consider exiting if initial connection is critical
        // process.exit(1);
    });
});




// --- Graceful Shutdown ---
const cleanup = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    whatsappStatus = 'SHUTTING_DOWN';
    try {
        if (client) {
            console.log("Attempting to destroy WhatsApp client connection...");
            await client.destroy(); // Cleanly close the connection
            console.log("WhatsApp client connection closed.");
        }
    } catch (e) {
        console.error("Error destroying WhatsApp client during shutdown:", e);
    } finally {
        server.close(() => {
            console.log("HTTPS server closed.");
            process.exit(0); // Exit process
        });
        // Force exit after a timeout if server.close hangs
        setTimeout(() => {
            console.error("Could not close connections gracefully after 10s, forcing shutdown.");
            process.exit(1);
        }, 10000);
    }
};

process.on('SIGINT', () => cleanup('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => cleanup('SIGTERM')); // Termination signal from OS/Docker