const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

const STOREFRONT_URL = process.env.STOREFRONT_URL;
const SBL_SCRIPT_URL = process.env.SBL_SCRIPT_URL;

if (!STOREFRONT_URL || !SBL_SCRIPT_URL) {
  console.error(
    "Missing STOREFRONT_URL or SBL_SCRIPT_URL in .env - copy .env.example " +
    "to .env and fill in both from your FastSpring checkout's " +
    "'Place on your Website' snippet before starting the server."
  );
  process.exit(1);
}

// index.html and product.html contain a static <script id="fsc-api">
// tag with {{STOREFRONT_URL}} / {{SBL_SCRIPT_URL}} placeholders. This is
// templated here, at request time, rather than injected client-side via
// JS - a dynamically-inserted script tag downloads asynchronously and
// misses the DOMContentLoaded window FastSpring's own script depends on
// internally, which is what silently broke every Add/Remove button in
// an earlier version of this template. See README for the full story.
function renderTemplatedHtml(filePath) {
  let html = fs.readFileSync(filePath, "utf8");
  html = html.replace(/{{STOREFRONT_URL}}/g, STOREFRONT_URL);
  html = html.replace(/{{SBL_SCRIPT_URL}}/g, SBL_SCRIPT_URL);
  return html;
}

app.get(["/", "/index.html"], (req, res) => {
  res.send(renderTemplatedHtml(path.join(__dirname, "..", "public", "index.html")));
});

app.get("/product.html", (req, res) => {
  res.send(renderTemplatedHtml(path.join(__dirname, "..", "public", "product.html")));
});

app.get("/checkout.html", (req, res) => {
  res.send(renderTemplatedHtml(path.join(__dirname, "..", "public", "checkout.html")));
});

// Everything else (css, js, images) is served as plain static files.
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/config", express.static(path.join(__dirname, "..", "config")));

app.post("/webhooks/fastspring", express.json(), (req, res) => {
  // TODO before going beyond a demo: verify the HMAC signature FastSpring
  // sends in the "X-FS-Signature" header using your webhook secret.
  console.log("Received FastSpring webhook:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Storefront running at http://localhost:${PORT}`);
  console.log(`Webhook endpoint at http://localhost:${PORT}/webhooks/fastspring`);
});
