const { PurchasesApi } = require("@unity-services/economy-2.5");

module.exports = async ({ params, context, logger }) => {
  const { projectId } = context;
  const { playerId, productId } = params;

  // By default, the Cloud Code JavaScript SDKs use the serviceToken from the context object
  const purchases = new PurchasesApi(context);

  try {
    const result = await purchases.makeVirtualPurchase({ projectId, playerId, playerPurchaseVirtualRequest: { id: productId } });
    return result.data;
  } catch (err) {
    throw err;
  }
}