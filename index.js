// const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
// const qrcode = require('qrcode-terminal');
// const fs = require('fs');
// const readline = require('readline');

// // Path to settings file
// const settingsFilePath = './settings.json';

// // Function to load settings from the JSON file
// function loadSettings() {
//     try {
//         const settings = fs.readFileSync(settingsFilePath);
//         return JSON.parse(settings);
//     } catch (error) {
//         console.error("Could not load settings, using default values.");
//         return { delayMin: 1000, delayMax: 3000 }; // Default delay values
//     }
// }

// // Function to save updated settings to the JSON file
// function saveSettings(newSettings) {
//     fs.writeFileSync(settingsFilePath, JSON.stringify(newSettings, null, 4));
// }

// // Function to add a delay (sleep)
// const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// // Initialize the WhatsApp client
// const client = new Client({
//     authStrategy: new LocalAuth()
// });

// // Generate QR code for authentication
// client.on('qr', (qr) => {
//     qrcode.generate(qr, { small: true });
// });

// // Event when the client is ready
// client.on('ready', async () => {
//     console.log('Client is ready!');
//     await showCommandMenu();
// });

// // Path to the media (image) file
// const mediaPath = './img2.jpg';

// // Function to send media and optionally text to all contacts
// async function sendMediaAndTextToContacts(numbers, messageText = null) {
//     const media = MessageMedia.fromFilePath(mediaPath);
//     const settings = loadSettings(); // Load delay settings
//     const delayMin = settings.delayMin;
//     const delayMax = settings.delayMax;

//     for (const number of numbers) {
//         const chatId = `${number}@c.us`;

//         try {
//             if (messageText) {
//                 await client.sendMessage(chatId, media, { caption: messageText });
//                 console.log(`Media and text sent to ${number}`);
//             } else {
//                 await client.sendMessage(chatId, media);
//                 console.log(`Media sent to ${number}`);
//             }

//             // Randomize the delay between min and max
//             const randomDelay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
//             console.log(`Waiting for ${randomDelay}ms before sending the next message...`);
//             await delay(randomDelay); // Apply delay

//         } catch (error) {
//             console.error(`Failed to send media to ${number}:`, error);
//         }
//     }
// }

// // Function to send text message to all contacts
// async function sendTextToContacts(numbers, messageText) {
//     const settings = loadSettings(); // Load delay settings
//     const delayMin = settings.delayMin;
//     const delayMax = settings.delayMax;

//     for (const number of numbers) {
//         const chatId = `${number}@c.us`;

//         try {
//             await client.sendMessage(chatId, messageText); // Send the text to each number
//             console.log(`Text message sent to ${number}`);

//             // Randomize the delay between min and max
//             const randomDelay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
//             console.log(`Waiting for ${randomDelay}ms before sending the next message...`);
//             await delay(randomDelay); // Apply delay

//         } catch (error) {
//             console.error(`Failed to send message to ${number}:`, error);
//         }
//     }
// }

// // Function to load numbers from a .txt file
// async function loadNumbersFromFile(filePath) {
//     const numbers = [];

//     const fileStream = fs.createReadStream(filePath);

//     const rl = readline.createInterface({
//         input: fileStream,
//         crlfDelay: Infinity
//     });

//     for await (const line of rl) {
//         const cleanNumber = line.trim();
//         if (cleanNumber) {
//             numbers.push(cleanNumber); // Add valid numbers to the array
//         }
//     }

//     return numbers;
// }

// // Function to display the command menu
// async function showCommandMenu() {
//     const numbers = await loadNumbersFromFile('./numbers.txt');
//     const settings = loadSettings(); // Load delay settings

//     console.log("\nSelect a command:");
//     console.log("1: Send Image to All Numbers");
//     console.log("2: Send Text Message to All Numbers");
//     console.log("3: Send Image with Text to All Numbers");
//     console.log("4: Add a Number to the List");
//     console.log("5: Remove a Number from the List");
//     console.log("6: Display Numbers in the List");
//     console.log("7: Update Delay Settings (Current: Min - " + settings.delayMin + "ms, Max - " + settings.delayMax + "ms)");
//     console.log("8: Exit");

//     const rl = readline.createInterface({
//         input: process.stdin,
//         output: process.stdout
//     });

//     rl.question("Enter your command number: ", async (command) => {
//         switch (command.trim()) {
//             case '1':
//                 await sendMediaAndTextToContacts(numbers); // Send only the image
//                 await showCommandMenu(); // Show the menu again
//                 break;
//             case '2':
//                 rl.question("Enter the message to send: ", async (messageText) => {
//                     await sendTextToContacts(numbers, messageText);
//                     rl.close();
//                     await showCommandMenu(); // Show the menu again
//                 });
//                 return;
//             case '3':
//                 rl.question("Enter the text to send with the image: ", async (messageText) => {
//                     await sendMediaAndTextToContacts(numbers, messageText);
//                     rl.close();
//                     await showCommandMenu(); // Show the menu again
//                 });
//                 return;
//             case '4':
//                 rl.question("Enter the number to add: ", async (number) => {
//                     await addNumberToFile(number, './numbers.txt');
//                     console.log(`Number ${number} added.`);
//                     rl.close();
//                     await showCommandMenu(); // Show the menu again
//                 });
//                 return;
//             case '5':
//                 rl.question("Enter the number to remove: ", async (number) => {
//                     await removeNumberFromFile(number, './numbers.txt');
//                     console.log(`Number ${number} removed.`);
//                     rl.close();
//                     await showCommandMenu(); // Show the menu again
//                 });
//                 return;
//             case '6':
//                 console.log("Numbers in the list:", numbers.join(', '));
//                 rl.close();
//                 await showCommandMenu(); // Show the menu again
//                 break;
//             case '7':
//                 rl.close();
//                 await updateDelaySettings(); // Update delay settings option
//                 break;
//             case '8':
//                 console.log("Exiting...");
//                 rl.close();
//                 process.exit();
//                 break;
//             default:
//                 console.log("Invalid command.");
//                 rl.close();
//                 await showCommandMenu(); // Show the menu again
//                 break;
//         }
//     });
// }

// // Function to update delay settings through the CLI
// async function updateDelaySettings() {
//     const rl = readline.createInterface({
//         input: process.stdin,
//         output: process.stdout
//     });

//     rl.question("Enter minimum delay (in ms): ", (minDelay) => {
//         rl.question("Enter maximum delay (in ms): ", (maxDelay) => {
//             const settings = loadSettings();
//             settings.delayMin = parseInt(minDelay, 10);
//             settings.delayMax = parseInt(maxDelay, 10);
//             saveSettings(settings);

//             console.log("Settings updated!");
//             rl.close();
//             showCommandMenu();
//         });
//     });
// }

// // Function to add a number to the file (ensures each number is on a new line)
// async function addNumberToFile(number, filePath) {
//     fs.appendFileSync(filePath, `${number.trim()}\n`);
// }

// // Function to remove a number from the file
// async function removeNumberFromFile(number, filePath) {
//     const numbers = await loadNumbersFromFile(filePath);
//     const filteredNumbers = numbers.filter(num => num !== number.trim());

//     fs.writeFileSync(filePath, filteredNumbers.join('\n') + '\n');
// }

// // Start the WhatsApp client
// client.initialize();
