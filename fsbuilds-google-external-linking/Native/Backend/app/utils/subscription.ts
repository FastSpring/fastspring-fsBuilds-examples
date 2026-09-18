import { DynamoDB } from 'aws-sdk';

const dynamoDb = new DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });

export enum SubscriptionState {
  ACTIVE = 'active',
  OVERDUE = 'overdue',
  DEACTIVATED = 'deactivated',
  TRIAL = 'trial',
  CANCELED = 'canceled',
}
export interface Subscription {
  playerId: string,
  subscriptionId: string,
  state: SubscriptionState
}

export async function getSubscription(playerId: string, subscriptionId: string): Promise<Subscription> {
  const result = await dynamoDb.get({
    TableName: process.env.DYNAMODB_SUBSCRIPTION_TABLE,
    Key: {
      playerId: playerId,
      subscriptionId: subscriptionId
    }
  }).promise();

  let subscription: Subscription;
  if (result.Item) {
    subscription = result.Item as Subscription;
  } else {
    subscription = {
      playerId,
      subscriptionId,
      state: SubscriptionState.DEACTIVATED
    }
  }

  return subscription;
}

export async function updateSubscription(playerId: string, subscriptionId: string, state: SubscriptionState): Promise<Subscription> {
  const item = {
    playerId: playerId,
    subscriptionId: subscriptionId,
    state: state
  };

  await dynamoDb.put({
    TableName: process.env.DYNAMODB_SUBSCRIPTION_TABLE,
    Item: item
  }).promise();

  return item;
}