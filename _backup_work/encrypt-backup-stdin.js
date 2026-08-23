const fs = require('fs');
const crypto = require('crypto');

const outputPath = process.argv[2];
const keyPath = process.argv[3];
if (!outputPath || !keyPath) {
  process.stderr.write('Usage: node encrypt-backup-stdin.js <output> <key-file>\n');
  process.exit(2);
}

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  const plaintext = Buffer.concat(chunks);
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from(JSON.stringify({
    format: 'k-map-house.aes-256-gcm.v1',
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  }) + '\n', 'utf8');
  fs.writeFileSync(outputPath, Buffer.concat([header, ciphertext]), { mode: 0o600 });
  fs.writeFileSync(keyPath, key.toString('base64') + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({ plaintextBytes: plaintext.length, encryptedBytes: header.length + ciphertext.length }));
});
