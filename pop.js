// const puppeteer = require('puppeteer');
// const fs = require('fs');
// const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
// const qrcode = require('qrcode-terminal');

// // Function to scrape the latest post from Instagram
// async function getLastInstagramPost(username) {
//     const browser = await puppeteer.launch({ headless: false });
//     const page = await browser.newPage();

//     await page.goto(`https://www.instagram.com/${username}/`, {
//         waitUntil: 'networkidle2'
//     });

//     // Get the latest image URL
//     const imageUrl = await page.evaluate(() => {
//         const latestPost = document.querySelector('article img');
//         return latestPost ? latestPost.src : null;
//     });

//     await browser.close();
//     return imageUrl;
// }

// // Function to download image from the scraped URL
// const downloadImage = async (url, filepath) => {
//     const response = await fetch(url);
//     const buffer = await response.buffer();
//     fs.writeFile(filepath, buffer, () =>
//         console.log('Image downloaded to:', filepath)
//     );
// };

// // WhatsApp Client Setup
// const client = new Client({
//     authStrategy: new LocalAuth()
// });

// client.on('qr', (qr) => {
//     qrcode.generate(qr, { small: true });
// });

// client.on('ready', () => {
//     console.log('Client is ready!');
// });

// // Load numbers from a text file
// function loadNumbersFromFile(filename) {
//     const data = fs.readFileSync(filename, 'utf8');
//     return data.split('\n').filter(Boolean);
// }

// // Send image to all numbers
// async function sendImageToAllNumbers(imagePath, numbersList) {
//     const media = MessageMedia.fromFilePath(imagePath);

//     for (const number of numbersList) {
//         let chatId = `${number}@c.us`;
//         await client.sendMessage(chatId, media);
//         console.log(`Image sent to: ${number}`);
//     }
// }

// client.on('ready', async () => {
//     const username = 'mawasemtravels';  // Your Instagram username
//     const imageUrl = await getLastInstagramPost(username);

//     if (imageUrl) {
//         const imagePath = './latest_post.jpg';
//         await downloadImage(imageUrl, imagePath);

//         const numbers = loadNumbersFromFile('numbers.txt');  // List of numbers in a text file
//         await sendImageToAllNumbers(imagePath, numbers);
//     } else {
//         console.log('Failed to get the latest Instagram post.');
//     }
// });

// client.initialize();
