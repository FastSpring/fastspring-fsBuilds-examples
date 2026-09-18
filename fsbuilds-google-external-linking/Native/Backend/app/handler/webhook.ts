import * as subscription from "../utils/subscription";

export const handler = async (req) => {
  const body = JSON.parse(req.body);
  const events = body.events;

  console.log(JSON.stringify(body));

  if (!Array.isArray(events)) {
    return createResponse({ success: false }, 400);
  }

  try {
    for (const event of events) {
      const playerId = event.data.tags.playerId;
      const subscriptionId = event.data.product;
      const state = event.data.state as subscription.SubscriptionState;

      await subscription.updateSubscription(playerId, subscriptionId, state);
    }
  } catch (e) {
    return createResponse({ success: false, reason: "Error updating subscription state" }, 500);
  }

  return createResponse({ success: true }, 200);
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