const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceIcon = path.join(__dirname, '../public/images/logo.png');
const targetDir = path.join(__dirname, '../build/icons');

const sizes = [16, 32, 48, 64, 128, 256, 512];

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

async function generate() {
  for (const size of sizes) {
    const outputPath = path.join(targetDir, `${size}x${size}.png`);
    await sharp(sourceIcon)
      .resize(size, size)
      .toFile(outputPath);
    console.log(`Generated: ${size}x${size}.png`);
  }
}

generate().catch(console.error);
