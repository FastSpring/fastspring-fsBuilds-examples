// API Service - Centralized API calls
const BASE_URL = 'https://k4cjts1bo6.execute-api.us-east-1.amazonaws.com/dev';

/**
 * Generic API call function
 * @param {string} endpoint - API endpoint (e.g., '/login')
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {object} body - Request body (optional)
 * @param {object} headers - Additional headers (optional)
 * @returns {Promise<object>} - API response
 */
export const apiCall = async (endpoint, method = 'GET', body = null, headers = {}) => {
  try {
    const config = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, config);
    const data = await response.json();

    return {
      success: response.ok,
      data,
      status: response.status,
    };
  } catch (error) {
    console.error('API call error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Login API call
 * @param {string} deviceId - Device ID
 * @returns {Promise<object>} - Login response
 */
export const loginApi = async (deviceId) => {
  return await apiCall('/login', 'POST', { deviceId });
};

/**
 * Get subscription status API call
 * @param {string} token - Authentication token
 * @param {string} subscriptionId - Subscription product ID (e.g., 'bronze-monthly')
 * @returns {Promise<object>} - Subscription status response
 */
export const getSubscriptionApi = async (token, subscriptionId) => {
  return await apiCall(
    '/getSubscription',
    'POST',
    { subscription: subscriptionId },
    { Authorization: token }
  );
};

/**
 * Get encoded payload for FastSpring checkout
 * @param {string} token - Authentication token
 * @param {string} subscriptionId - Subscription product ID
 * @returns {Promise<object>} - Encoded payload response with securePayload and secureKey
 */
export const getEncodedPayloadApi = async (token, subscriptionId) => {
  return await apiCall(
    '/encode',
    'POST',
    { subscription: subscriptionId },
    { Authorization: token }
  );
};

