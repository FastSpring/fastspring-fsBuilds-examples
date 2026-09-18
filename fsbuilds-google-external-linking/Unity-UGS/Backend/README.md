# Backend FastSpring integration: using AWS Serverless TypeScript

This is an example of how to integrate FastSpring from a backend side. 

For this example we are using:
- Amazon Web Services (AWS)
- Serverless framework
- Nodejs/Typescript
- Unity Gaming Services (UGS)

Alternatively you can use any other setup more familiar to you.

## Setup
### UGS
In UGS Economy, you need to define the [Virtual Purchase](https://docs.unity.com/ugs/manual/economy/manual/add-virtual-purchase) that we will use.

For this example, we need to make sure that the Resource ID of Virtual Purchase matches the Product SKU in the FastSpring Catalog. This data is sent in the [webhook callback](https://developer.fastspring.com/reference/ordercompleted) and used by this example to know which product to grant in UGS 
### AWS
First need to set your environment up with your own details/credentials.

In [serverless.yml](serverless.yml) file you have:
``` 
UGS_PROJECT_ID: {{YOUR_UGS_PROJECT_ID}}
UGS_ENV_ID: {{YOUR_UGS_ENV_ID}}
UGS_SERVICE_ACCOUNT_SECRET: {{YOUR_UGS_SERVICE_ACCOUNT_SECRET}}
PEM_PRIVATE_KEY: {{YOUR_PEM_PRIVATE_KEY}}
```

You need to replace these values with your own.

You can find `UGS_PROJECT_ID`, `UGS_ENV_ID` and `UGS_SERVICE_ACCOUNT_SECRET` in your Unity Gaming Services account.

`PEM_PRIVATE_KEY` is the one you need to generate and store in order to have [FastSpring secure payload](https://developer.fastspring.com/reference/pass-a-secure-request#set-up-encryption)

## Endpoints
### UGS
#### VirtualPurchase
We use this endpoint to grant the purchase to the player.

Usage
```
curl https://cloud-code.services.api.unity.com/v1/projects/<YOUR_UGS_PROJECT_ID>/scripts/VirtualPurchase
--request POST
--header 'Authorization: <exchange_token>' 
--header 'Content-Type: application/json' 
--data '{
    "params": {
        "playerId": "<target_player_id>",
        "productId":"<purchased_item_id>"
    }
}'
```
Where:
- `YOUR_UGS_PROJECT_ID` is your UGS project id
- `exchange_token` is the token obtained using [this API](https://services.docs.unity.com/auth/v1/#tag/Authentication/operation/exchangeToStateless)
- `target_player_id` is the Unity player to grant the items/currencies
- `purchased_item_id` is the [Virtual Purchase id](https://docs.unity.com/ugs/manual/economy/manual/add-virtual-purchase) defined on UGS 

### AWS
#### Encode payload
We use this endpoint to:
- Identify the player based on the token received from UGS Auth
- Encode the secure payload that we will pass to FastSpring following [documentation](https://developer.fastspring.com/reference/pass-a-secure-request#secure-payloads)

Usage
```
curl https://xxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev/encode
--request POST
--header 'Authorization: <your_access_token>' 
--header 'Content-Type: application/json' 
--data '{
    "product": "<your_product_id>"
}'
```

#### FastSpring webhook
We use this endpoint to:
- Receive webhook calls following [documentation](https://developer.fastspring.com/reference/webhooks-overview)
- Call UGS Cloud Code to grant the player the corresponding items/currencies

## Deployment

### UGS
You can deploy the `VirtualPurchase` script directly on [UGS Cloud Code Dashboard](https://cloud.unity.com/)   

### AWS
Once configured your [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html), to deploy simply run:

```
$ npm run deploy

# or

$ serverless deploy
```

