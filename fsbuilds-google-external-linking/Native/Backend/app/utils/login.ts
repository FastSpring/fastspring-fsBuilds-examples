const crypto = require('crypto');
import * as jwt from 'jsonwebtoken';
import { DynamoDB } from 'aws-sdk';

const dynamoDb = new DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });

export interface LoginInfo {
  deviceId: string,
  playerId: string,
  token: string
}

export async function login(deviceId): Promise<LoginInfo> {
  const result = await dynamoDb.get({
    TableName: process.env.DYNAMODB_LOGIN_TABLE,
    Key: {
      deviceId: deviceId
    }
  }).promise();

  let playerId;
  if (result.Item) {
    playerId = result.Item.playerId;
  } else {
    playerId = crypto.randomUUID();
    await dynamoDb.put({
      TableName: process.env.DYNAMODB_LOGIN_TABLE,
      Item: {
        deviceId: deviceId,
        playerId: playerId
      }
    }).promise();
  }

  return {
    deviceId,
    playerId,
    token: jwt.sign({ deviceId, playerId }, process.env.JWT_MY_SECRET, { expiresIn: 86400 })
  };
}

export async function validateToken(token) {
  const payload = jwt.verify(token, process.env.JWT_MY_SECRET) as jwt.JwtPayload;
  return payload.playerId;
}
