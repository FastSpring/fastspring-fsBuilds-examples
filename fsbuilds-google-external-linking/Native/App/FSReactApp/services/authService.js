// Auth Service - Handle authentication logic
import { loginApi } from './apiService';
import { getDeviceId } from './deviceService';
import { savePlayerId, saveToken } from './storageService';

/**
 * Perform login
 * @returns {Promise<object>} - Login result with success status and data
 */
export const login = async () => {
  try {
    // Get device ID
    const deviceId = await getDeviceId();

    const result = await loginApi(deviceId);

    if (result.success && result.data.success && result.data.login) {
      await savePlayerId(result.data.login.playerId);
      await saveToken(result.data.login.token);

      return {
        success: true,
        data: result.data.login,
      };
    } else {
      return {
        success: false,
        error: 'Login failed',
      };
    }
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};
