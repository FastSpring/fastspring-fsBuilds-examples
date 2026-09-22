// Standalone test for Google's externalTransactions.create call — decouples
// "does Google now accept externalContentLinkDetails" from the full
// app+webhook pipeline. Mirrors app/utils/google.ts's reportTransactionToGoogle
// exactly (same endpoint, same request body shape, same auth), so a pass/fail
// here is a direct answer to the README's open question, not an approximation.
//
// Usage:
//   GOOGLE_SERVICE_ACCOUNT_JSON='<the full service account JSON>' \
//   npx ts-node scripts/test-google-report.ts --token <realExternalTransactionToken> [options]
//
// Required:
//   --token <token>            A real, unused externalTransactionToken from a
//                               live device (Play Billing's
//                               createBillingProgramReportingDetailsAsync). This
//                               cannot be fabricated — Google validates it
//                               server-side and single-use tokens can't be
//                               replayed, so each real run needs a fresh one.
//
// Optional (sensible test defaults if omitted):
//   --id <externalTransactionId>   Defaults to "test-<timestamp>"
//   --preTax <amount>              Defaults to 4.99
//   --tax <amount>                 Defaults to 0.40
//   --currency <code>              Defaults to USD
//   --packageName <id>             Defaults to com.ollieinteractive.fastspringpoc
//
// Also requires GOOGLE_SERVICE_ACCOUNT_JSON in the environment (same variable
// the real backend uses) — either the raw JSON string, or set
// GOOGLE_SERVICE_ACCOUNT_JSON_PATH to a file containing it instead.

import { google } from 'googleapis';
import * as fs from 'fs';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function toPriceMicros(amount: number): string {
  return String(Math.round(Number(amount) * 1_000_000));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.token) {
    console.error('Missing required --token <externalTransactionToken>.');
    console.error('This has to be a real, unused token from a live device — see the usage comment at the top of this script.');
    process.exit(1);
  }

  const packageName = args.packageName || 'com.ollieinteractive.fastspringpoc';
  const externalTransactionId = args.id || `test-${Date.now()}`;
  const preTaxAmount = Number(args.preTax ?? 4.99);
  const taxAmount = Number(args.tax ?? 0.40);
  const currency = args.currency || 'USD';
  const completedAtMs = Date.now();

  let serviceAccountJsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJsonRaw && process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH) {
    serviceAccountJsonRaw = fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH, 'utf8');
  }
  if (!serviceAccountJsonRaw) {
    console.error('Missing GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_SERVICE_ACCOUNT_JSON_PATH) in the environment.');
    process.exit(1);
  }

  const serviceAccountJson = JSON.parse(serviceAccountJsonRaw);
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountJson,
    scopes: ['https://www.googleapis.com/auth/androidpublisher']
  });

  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  const accessToken = accessTokenResponse?.token;
  if (!accessToken) {
    console.error('Failed to obtain a Google access token — check the service account JSON and its Play Console permissions.');
    process.exit(1);
  }

  // Identical shape to app/utils/google.ts's reportTransactionToGoogle —
  // keep these two in sync if the real request body ever changes.
  const requestBody = {
    originalPreTaxAmount: {
      priceMicros: toPriceMicros(preTaxAmount),
      currency
    },
    originalTaxAmount: {
      priceMicros: toPriceMicros(taxAmount),
      currency
    },
    transactionTime: new Date(completedAtMs).toISOString(),
    oneTimeTransaction: {
      externalTransactionToken: args.token
    },
    userTaxAddress: {
      regionCode: 'US'
    },
    externalContentLinkDetails: {
      linkType: 'LINK_TO_DIGITAL_CONTENT_OFFER'
    }
  };

  console.log('--- Request ---');
  console.log(`POST https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/externalTransactions?externalTransactionId=${encodeURIComponent(externalTransactionId)}`);
  console.log(JSON.stringify(requestBody, null, 2));

  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/externalTransactions?externalTransactionId=${encodeURIComponent(externalTransactionId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }
  );
  const data: any = await response.json();

  console.log('\n--- Response ---');
  console.log(`Status: ${response.status} ${response.ok ? '(OK)' : '(rejected)'}`);
  console.log(JSON.stringify(data, null, 2));

  if (response.ok) {
    console.log('\nSuccess — externalContentLinkDetails was accepted. The 400 documented in README.md appears to be resolved for this app.');
  } else if (
    typeof data?.error?.message === 'string' &&
    data.error.message.includes('external_content_link_details must be set')
  ) {
    console.log('\nSame 400 as documented in README.md — still unresolved on Google\'s side for this app.');
  } else {
    console.log('\nRejected, but with a different error than the documented 400 — read the message above before concluding anything.');
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
