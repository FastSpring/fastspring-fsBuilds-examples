import * as login from "../utils/login";

export const handler = async (req) => {
  const body = JSON.parse(req.body);
  const deviceId = body.deviceId

  if (!deviceId) {
    return createResponse({ success: false, reason: "Missing deviceId in body" }, 400);
  }

  try {
    const loginInfo = await login.login(deviceId);
    return createResponse({ success: true, login: loginInfo }, 200);

  } catch (error) {
    return createResponse({ success: false, reason: "Error login" }, 500);
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