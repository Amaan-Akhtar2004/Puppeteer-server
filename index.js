const express = require('express');
const puppeteer = require('puppeteer-extra');
const { v4: uuidv4 } = require('uuid');
const { PNG } = require('pngjs');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const port = 3000;

let browser;

const uploadToCloudinary = (buffer, filename) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream({ folder: 'differences', public_id: filename }, (error, result) => {
      if (error) {
        return reject(error);
      }
      resolve(result);
    });

    uploadStream.end(buffer);
  });
};

async function runLoginByPass(page, loginByPassCode) {
  try {
    // Create a new function using JavaScript's Function constructor
    const runCode = new Function(`
      return (async () => {
        ${loginByPassCode}
      })();
    `);

    // Evaluate the dynamically created function inside the page context
    await page.evaluate(runCode);

    // Return success status
    return true;

  } catch (error) {
    console.error('Error executing loginByPass code:', error);

    // Return failure status
    return false;
  }
}

(async () => {
  // Initialize Puppeteer with the stealth plugin
  browser = await puppeteer.launch({ headless: true });

  // Middleware to parse JSON requests
  app.use(express.json());

  // Endpoint to process URL
  app.post('/screenshot', async (req, res) => {
    const { url, imageName, divSelector, loginByPass } = req.body;

    // UUID's random string
    const index = uuidv4();

    try {
      // Initialize a new page
      const page = await browser.newPage();

      // Set User agent so that request appears to be sent by a browser
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.69 Safari/537.36"
      );

      // Set Timezone
      await page.emulateTimezone('Asia/Kolkata');

      let successfulLoginByPass = true;

      await page.goto(url, { waitUntil: ['domcontentloaded', 'networkidle2'] });
      await page.setViewport({ width: 1920, height: 1080 });

      // If there exists loginByPass code run it on the page
      if (loginByPass) {
        successfulLoginByPass = await runLoginByPass(page, loginByPass);
      }

      let element;
      try {
        await page.waitForSelector(divSelector, { timeout: 30000 });

        // Wait for all images within the div to be fully loaded
        await page.evaluate(async (sel) => {
          const element = document.querySelector(sel);
          if (element) {
            const images = Array.from(element.querySelectorAll('img'));
            await Promise.all(images.map(img => {
              if (img.complete) return Promise.resolve();
              return new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
              });
            }));
          }
        }, divSelector);

        // Increase the z-index of the div selected in every case
        await page.evaluate((sel) => {
          const element = document.querySelector(sel);
          if (element) {
            element.style.zIndex = 10000000;
          }
        }, divSelector);

        element = await page.$(divSelector);
      } catch (timeoutError) {
        console.warn(`Selector ${divSelector} not found within the timeout period. Taking full page screenshot.`);
      }

      let screenshotBuffer;
      if (successfulLoginByPass && element) {
        screenshotBuffer = await element.screenshot({ encoding: 'binary' });
      } else {
        screenshotBuffer = await page.screenshot({ encoding: 'binary', fullPage: true });
      }

      // Upload the latest screenshot
      const uploadNewImage = await uploadToCloudinary(screenshotBuffer, `${index}.png`);

      // Close the page after uploads are complete
      await page.close();

      // Return the result object
      res.json({ referenceUrl: uploadNewImage.secure_url });

    } catch (error) {
      console.error(`Error capturing screenshot for ${url}:`, error);
      res.status(500).json({ error: 'Error capturing screenshot' });
    }
  });

  // Start the server
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });

  // Close the browser when the process exits
  process.on('exit', async () => {
    await browser.close();
  });

})();
