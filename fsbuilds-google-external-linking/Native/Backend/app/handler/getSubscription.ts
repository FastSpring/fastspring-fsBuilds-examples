import * as login from "../utils/login";
import * as subscription from "../utils/subscription";

export const handler = async (req) => {
  const accessToken = req.headers.Authorization;
  const body = JSON.parse(req.body);
  const subscriptionId = body.subscription

  if (!accessToken) {
    return createResponse({ success: false, reason: "Missing Authorization header" }, 400);
  }

  if (!subscriptionId) {
    return createResponse({ success: false, reason: "Missing subscription in body" }, 400);
  }

  let playerId;
  try {
    playerId = await login.validateToken(accessToken);
  } catch (e) {
    return createResponse({ success: false, reason: "Error validating token" }, 400);
  }

  try {
    const playerSubscription = await subscription.getSubscription(playerId, subscriptionId);
    return createResponse({ success: true, subscription: playerSubscription }, 200);

  } catch (error) {
    return createResponse({ success: false, reason: "Error getting subscription" }, 500);
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