const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

puppeteer.use(StealthPlugin());

let browser;
let page;

const username = "agam.kapil@sprinklr.com"
const password = "erenNaruto@123"

// https://github.com/hugh-bowie/instagram-bot
function r(min, max) {
	return ~~(Math.random() * (max - min) + min);
}

const r15 = r(1000, 1500);

const instaLogin = async(page) => {

    await page.goto('https://www.instagram.com/accounts/login/?source=auth_switcher', { waitUntil: 'networkidle2' });
    await page.waitForSelector("input[name='username']");
    await page.tap("input[name='username']");
    await page.type("input[name='username']", username, { delay: r(50, 100) });
    await page.type("input[name='password']", password, { delay: r(50, 100) });
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.tap("[type='submit']")]);
  
    console.log('Logged in successfully');
}

// Initialize Puppeteer browser instance on server start
(async () => {
  browser = await puppeteer.launch({ headless: true });
  page = await browser.newPage();
  await instaLogin(page);
})();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(bodyParser.json());

app.post('/screenshot', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  try {
    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'networkidle2' });

    const screenshotPath = path.join(__dirname, 'screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Upload screenshot to Cloudinary
    const cloudinaryResponse = await uploadToCloudinary(screenshotPath);

    // Remove the screenshot file after upload
    fs.unlinkSync(screenshotPath);

    await page.close();

    res.json({ url: cloudinaryResponse.secure_url });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while taking the screenshot');
  }
});

const uploadToCloudinary = async (filePath) => {
  return cloudinary.uploader.upload(filePath, {
    folder: 'differences',
  });
};

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await browser.close();
  process.exit();
});

process.on('SIGTERM', async () => {
  await browser.close();
  process.exit();
});
