import * as ugs from "../utils/ugs";
import * as crypto from "../utils/crypto";

export const handler = async (req) => {
  const accessToken = req.headers.Authorization;
  const body = JSON.parse(req.body);
  const product = body.product
  // Present only on the Android External Content Links steering path — see
  // ShoppingManager.cs. Tagged onto the order so the order.completed webhook
  // can record the real transaction data against this token, for
  // /reportTransaction to look up later instead of trusting client-supplied
  // amounts.
  const googleExternalTransactionToken = body.googleExternalTransactionToken;
  // Present only on the iOS External Purchase Link steering path — see
  // ShoppingManager.cs. Tagged onto the order so the order.completed webhook
  // can later match this purchase back to the tap(s) that started it. EU
  // storefronts carry two tokens (Acquisition + Services, per Apple's
  // guidance to request both); Japan carries one (LinkOut) — arrays here
  // are never longer than 2. FastSpring tags are flat key-value pairs, so
  // each token gets its own indexed tag rather than a nested structure.
  const externalPurchaseTokens: string[] = Array.isArray(body.externalPurchaseTokens) ? body.externalPurchaseTokens : [];
  const externalPurchaseTokenTypes: string[] = Array.isArray(body.externalPurchaseTokenTypes) ? body.externalPurchaseTokenTypes : [];

  if (!accessToken) {
    return createResponse({ success: false, reason: "Missing Authorization header" }, 400);
  }

  if (!product) {
    return createResponse({ success: false, reason: "Missing product in body" }, 400);
  }

  let playerId;
  try {
    playerId = await ugs.validateUnityToken(accessToken);
  } catch (e) {
    return createResponse({ success: false, reason: "Error validating token" }, 400);
  }

  try {
    const externalPurchaseTags: Record<string, string> = {};
    externalPurchaseTokens.forEach((token, i) => {
      if (!token) return;
      externalPurchaseTags[`externalPurchaseToken${i + 1}`] = token;
      if (externalPurchaseTokenTypes[i]) {
        externalPurchaseTags[`externalPurchaseTokenType${i + 1}`] = externalPurchaseTokenTypes[i];
      }
    });

    const payload = {
      items: [
        {
          product: product
        }
      ],
      tags: {
        playerId: playerId,
        ...(googleExternalTransactionToken ? { googleExternalTransactionToken } : {}),
        ...externalPurchaseTags
      }
    };

    const aesKey = crypto.getAesKey();
    const securePayload = crypto.securePayload(aesKey, payload);
    const secureKey = crypto.secureKey(aesKey);

    return createResponse({ success: true, securePayload, secureKey }, 200);

  } catch (error) {
    return createResponse({ success: false, reason: "Error creating encoded payload" }, 500);
  }
};

function createResponse(body: any, status: number) {
  return {
    "statusCode": status,
    "headers": {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT"
    },
    "body": JSON.stringify(body),
    "isBase64Encoded": false
  };
}