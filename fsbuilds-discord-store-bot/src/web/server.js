const express = require('express');
const webhookRouter = require('./routes/webhook');

function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Capture the raw request body string before JSON parsing.
  // This is required for HMAC signature verification in the webhook handler —
  // once express.json() parses the body, the original bytes are gone.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  app.use('/webhook', webhookRouter);

  return new Promise((resolve, reject) => {
    app
      .listen(PORT, () => {
        console.log(`Web server running on port ${PORT}`);
        resolve();
      })
      .on('error', reject);
  });
}

module.exports = { startServer };
