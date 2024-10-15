const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const readline = require('readline');

// Initialize Express
const app = express();
app.use(express.json());

// Path to settings file
const settingsFilePath = './settings.json';

// Function to load settings from the JSON file
function loadSettings() {
    try {
        const settings = fs.readFileSync(settingsFilePath);
        return JSON.parse(settings);
    } catch (error) {
        console.error("Could not load settings, using default values.");
        return { delayMin: 1000, delayMax: 3000 };
    }
}

// Function to save updated settings to the JSON file
function saveSettings(newSettings) {
    fs.writeFileSync(settingsFilePath, JSON.stringify(newSettings, null, 4));
}

// Function to add a delay (sleep)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Initialize the WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth()
});

// QR Code Generation
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR code generated');
});

// When WhatsApp is ready
client.on('ready', () => {
    console.log('WhatsApp client is ready!');
});

// Path to the media (image) file
const mediaPath = './img2.jpg';

// Function to send media and text
async function sendMediaAndTextToContacts(numbers, messageText = null) {
    const media = MessageMedia.fromFilePath(mediaPath);
    const settings = loadSettings();
    const delayMin = settings.delayMin;
    const delayMax = settings.delayMax;

    for (const number of numbers) {
        const chatId = `${number}@c.us`;

        try {
            if (messageText) {
                await client.sendMessage(chatId, media, { caption: messageText });
                console.log(`Media and text sent to ${number}`);
            } else {
                await client.sendMessage(chatId, media);
                console.log(`Media sent to ${number}`);
            }

            const randomDelay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
            await delay(randomDelay);
        } catch (error) {
            console.error(`Failed to send media to ${number}:`, error);
        }
    }
}

// Function to send text message
async function sendTextToContacts(numbers, messageText) {
    const settings = loadSettings();
    const delayMin = settings.delayMin;
    const delayMax = settings.delayMax;

    for (const number of numbers) {
        const chatId = `${number}@c.us`;

        try {
            await client.sendMessage(chatId, messageText);
            console.log(`Text message sent to ${number}`);

            const randomDelay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
            await delay(randomDelay);
        } catch (error) {
            console.error(`Failed to send message to ${number}:`, error);
        }
    }
}

// Function to load numbers from a file
async function loadNumbersFromFile(filePath) {
    const numbers = [];
    const fileStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        const cleanNumber = line.trim();
        if (cleanNumber) {
            numbers.push(cleanNumber);
        }
    }

    return numbers;
}

// Express API Routes

// Route to send an image to all contacts
app.post('/send-image', async (req, res) => {
    const numbers = await loadNumbersFromFile('./numbers.txt');
    await sendMediaAndTextToContacts(numbers);
    res.send('Image sent to all contacts!');
});

// Route to send a text message to all contacts
app.post('/send-text', async (req, res) => {
    const { messageText } = req.body;
    const numbers = await loadNumbersFromFile('./numbers.txt');
    await sendTextToContacts(numbers, messageText);
    res.send('Text message sent to all contacts!');
});

// Route to send an image with text to all contacts
app.post('/send-image-with-text', async (req, res) => {
    const { messageText } = req.body;
    const numbers = await loadNumbersFromFile('./numbers.txt');
    await sendMediaAndTextToContacts(numbers, messageText);
    res.send('Image and text sent to all contacts!');
});

// Route to update delay settings
app.post('/update-settings', (req, res) => {
    const { delayMin, delayMax } = req.body;
    const settings = loadSettings();
    settings.delayMin = delayMin;
    settings.delayMax = delayMax;
    saveSettings(settings);
    res.send('Delay settings updated!');
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Initialize WhatsApp client
client.initialize();
