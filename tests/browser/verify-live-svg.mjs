import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();

await page.goto('http://127.0.0.1:3000/customer/index.html');

const result = await page.evaluate(async () => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = '/assets/favicon.svg';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = (e) => reject(new Error('Image failed to load'));
  });

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const center = Array.from(ctx.getImageData(256, 256, 1, 1).data);
  const cornerBg = Array.from(ctx.getImageData(50, 50, 1, 1).data);

  // Check volt green presence
  const fullData = ctx.getImageData(0, 0, 512, 512).data;
  let voltCount = 0;
  for (let i = 0; i < fullData.length; i += 4) {
    const r = fullData[i];
    const g = fullData[i + 1];
    const b = fullData[i + 2];
    if (g > 160 && r > 140 && b < 100) {
      voltCount++;
    }
  }

  return { center, cornerBg, voltCount };
});

console.log('Browser rendered /assets/favicon.svg live test:', result);
if (result.voltCount < 1000) {
  throw new Error('Volt green emblem was not rendered by browser!');
}
console.log('SUCCESS: Volt green emblem rendered with', result.voltCount, 'pixels!');
await browser.close();

