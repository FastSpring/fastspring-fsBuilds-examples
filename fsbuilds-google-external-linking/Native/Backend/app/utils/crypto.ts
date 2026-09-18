const crypto = require('crypto');

export function getAesKey() {
  return crypto.randomBytes(16);
}

export function securePayload(aesKey, payload) {
  const cipher = crypto.createCipheriv('aes-128-ecb', aesKey, null);
  let cipherText = cipher.update(JSON.stringify(payload), 'utf8');
  cipherText = Buffer.concat([cipherText, cipher.final()]);

  return cipherText.toString('base64');
}

export function secureKey(aesKey) {
  const privateKey = crypto.createPrivateKey({
    key: process.env.PEM_PRIVATE_KEY,
    format: 'pem',
    type: 'pkcs8'
  });

  const aesKeyEncrypted = crypto.privateEncrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING
    },
    aesKey
  );

  return aesKeyEncrypted.toString('base64');
}