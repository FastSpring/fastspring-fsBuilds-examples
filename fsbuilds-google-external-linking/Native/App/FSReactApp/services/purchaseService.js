// Purchase Service - Handle FastSpring checkout flow
import { getEncodedPayloadApi } from './apiService';

const STORE_BASE_URL = 'https://d57fe5ecwtc31.cloudfront.net';
const SUBSCRIPTION_ID = 'bronze-monthly';

/**
 * Prepare FastSpring checkout URL
 * @param {string} token - Authentication token
 * @param {string} productId - Product ID (default: 'bronze-monthly')
 * @returns {Promise<object>} - Result with checkout URL or error
 */
export const prepareCheckoutUrl = async (token, productId = SUBSCRIPTION_ID) => {
  try {
    console.log('[PurchaseService] Requesting encoded payload for product:', productId);

    // Get encoded payload from backend
    const result = await getEncodedPayloadApi(token, productId);

    console.log('[PurchaseService] Encode API result:', JSON.stringify(result, null, 2));

    if (!result.success || !result.data.success || !result.data.encode) {
      console.error('[PurchaseService] Failed to get encoded payload:', result);
      return {
        success: false,
        error: 'Failed to prepare checkout',
      };
    }

    const { securePayload, secureKey } = result.data.encode;

    // URL encode the payload and key
    const encodedPayload = encodeURIComponent(securePayload);
    const encodedKey = encodeURIComponent(secureKey);

    // Construct FastSpring checkout URL with deep link return URL
    const returnUrl = 'fsreactapp://purchase-complete';
    const encodedReturnUrl = encodeURIComponent(returnUrl);

    const checkoutUrl = `${STORE_BASE_URL}?` +
      `product=${productId}&` +
      `securePayload=${encodedPayload}&` +
      `secureKey=${encodedKey}&` +
      `returnUrl=${encodedReturnUrl}`;

    console.log('[PurchaseService] Generated checkout URL:');
    console.log('[PurchaseService] Full URL:', checkoutUrl);
    console.log('[PurchaseService] URL Length:', checkoutUrl.length);
    console.log('[PurchaseService] Return URL:', returnUrl);

    return {
      success: true,
      checkoutUrl,
      securePayload,
      secureKey,
    };
  } catch (error) {
    console.error('[PurchaseService] Error preparing checkout URL:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};
