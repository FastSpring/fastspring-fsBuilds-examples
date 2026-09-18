// Storage Service - Handle all local storage operations
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  PLAYER_ID: '@playerId',
  TOKEN: '@token',
};

/**
 * Save player ID
 * @param {string} playerId - Player ID
 * @returns {Promise<boolean>} - Success status
 */
export const savePlayerId = async (playerId) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PLAYER_ID, playerId);
    return true;
  } catch (error) {
    console.error('Error saving player ID:', error);
    return false;
  }
};

/**
 * Get stored player ID
 * @returns {Promise<string|null>} - Player ID or null
 */
export const getPlayerId = async () => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.PLAYER_ID);
  } catch (error) {
    console.error('Error getting player ID:', error);
    return null;
  }
};

/**
 * Save authentication token
 * @param {string} token - Authentication token
 * @returns {Promise<boolean>} - Success status
 */
export const saveToken = async (token) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
    return true;
  } catch (error) {
    console.error('Error saving token:', error);
    return false;
  }
};

/**
 * Get stored authentication token
 * @returns {Promise<string|null>} - Token or null
 */
export const getToken = async () => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
};

/**
 * Save both player ID and token
 * @param {string} playerId - Player ID
 * @param {string} token - Authentication token
 * @returns {Promise<boolean>} - Success status
 */
export const savePlayerData = async (playerId, token) => {
  try {
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.PLAYER_ID, playerId],
      [STORAGE_KEYS.TOKEN, token],
    ]);
    return true;
  } catch (error) {
    console.error('Error saving player data:', error);
    return false;
  }
};

/**
 * Get both player ID and token
 * @returns {Promise<object>} - Object with playerId and token
 */
export const getPlayerData = async () => {
  try {
    const [[, playerId], [, token]] = await AsyncStorage.multiGet([
      STORAGE_KEYS.PLAYER_ID,
      STORAGE_KEYS.TOKEN,
    ]);
    return { playerId, token };
  } catch (error) {
    console.error('Error getting player data:', error);
    return { playerId: null, token: null };
  }
};

/**
 * Clear player data
 * @returns {Promise<boolean>} - Success status
 */
export const clearPlayerData = async () => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.PLAYER_ID,
      STORAGE_KEYS.TOKEN,
    ]);
    return true;
  } catch (error) {
    console.error('Error clearing player data:', error);
    return false;
  }
};

/**
 * Check if player data exists
 * @returns {Promise<boolean>} - True if both player ID and token exist
 */
export const hasPlayerData = async () => {
  const { playerId, token } = await getPlayerData();
  return !!(playerId && token);
};
