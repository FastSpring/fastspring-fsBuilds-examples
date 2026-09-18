import * as login from "../utils/login";
import * as crypto from "../utils/crypto";

export const handler = async (req) => {
  const accessToken = req.headers.Authorization;
  const body = JSON.parse(req.body);
  const subscription = body.subscription

  if (!accessToken) {
    return createResponse({ success: false, reason: "Missing Authorization header" }, 400);
  }

  if (!subscription) {
    return createResponse({ success: false, reason: "Missing subscription in body" }, 400);
  }

  let playerId;
  try {
    playerId = await login.validateToken(accessToken);
  } catch (e) {
    return createResponse({ success: false, reason: "Error validating token" }, 400);
  }

  try {
    const payload = {
      items: [
        {
          product: subscription
        }
      ],
      tags: {
        playerId: playerId
      }
    };

    const aesKey = crypto.getAesKey();
    const securePayload = crypto.securePayload(aesKey, payload);
    const secureKey = crypto.secureKey(aesKey);

    return createResponse({ success: true, encode: { securePayload, secureKey } }, 200);

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