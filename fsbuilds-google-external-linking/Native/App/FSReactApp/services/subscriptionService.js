// Subscription Service - Handle subscription logic
import { getSubscriptionApi } from './apiService';

const SUBSCRIPTION_ID = 'bronze-monthly';

// Subscription states enum
export const SubscriptionState = {
  ACTIVE: 'active',
  OVERDUE: 'overdue',
  DEACTIVATED: 'deactivated',
  TRIAL: 'trial',
  CANCELED: 'canceled',
};

/**
 * Check if subscription state grants access
 * @param {string} state - Subscription state
 * @returns {boolean} - True if user has access
 */
const hasAccess = (state) => {
  // User has access if the subscription is active, overdue, or in trial
  return [
    SubscriptionState.ACTIVE,
    SubscriptionState.OVERDUE,
    SubscriptionState.TRIAL,
  ].includes(state);
};

/**
 * Check subscription status
 * @param {string} token - Authentication token
 * @param {string} playerId - Player ID to validate
 * @returns {Promise<object>} - Subscription check result
 */
export const checkSubscription = async (token, playerId) => {
  try {
    const result = await getSubscriptionApi(token, SUBSCRIPTION_ID);

    if (result.success && result.data.success && result.data.subscription) {
      const subscription = result.data.subscription;

      if (subscription.playerId !== playerId) {
        console.error('Player ID mismatch!', {
          expected: playerId,
          received: subscription.playerId,
        });
        return {
          success: false,
          error: 'Player ID mismatch',
          isActive: false,
        };
      }

      const isActive = hasAccess(subscription.state);

      return {
        success: true,
        isActive,
        state: subscription.state,
        subscription: subscription,
      };
    } else {
      return {
        success: false,
        error: 'Failed to get subscription status',
        isActive: false,
      };
    }
  } catch (error) {
    console.error('Subscription check error:', error);
    return {
      success: false,
      error: error.message,
      isActive: false,
    };
  }
};
