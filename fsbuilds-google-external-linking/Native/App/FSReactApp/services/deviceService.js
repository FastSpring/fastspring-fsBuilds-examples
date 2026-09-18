// Device Service - Handle device ID
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';

const STORAGE_KEYS = {
  DEVICE_ID: '@deviceId',
  DEVICE_DATA: '@deviceData',
};

/**
 * Generate or retrieve device ID
 * @returns {Promise<string>} - Device ID
 */
export const getDeviceId = async () => {
  try {
    let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);

    if (!deviceId) {
      if (Application.androidId) {
        deviceId = Application.androidId;
      } else {
        // iOS: vendor identifier
        try {
          const iosId = await Application.getIosIdForVendorAsync();
          deviceId = iosId || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        } catch {
          deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
      }

      deviceId = String(deviceId);

      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    }

    return deviceId;
  } catch (error) {
    console.error('Error getting device ID:', error);
    // Fallback to timestamp-based ID
    return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
};

/**
 * Save device data (any data related to the device)
 * @param {object} data - Device data to save
 * @returns {Promise<boolean>} - Success status
 */
export const saveDeviceData = async (data) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_DATA, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Error saving device data:', error);
    return false;
  }
};

/**
 * Get stored device data
 * @returns {Promise<object|null>} - Device data or null
 */
export const getDeviceData = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_DATA);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting device data:', error);
    return null;
  }
};

/**
 * Clear device data
 * @returns {Promise<boolean>} - Success status
 */
export const clearDeviceData = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.DEVICE_DATA);
    return true;
  } catch (error) {
    console.error('Error clearing device data:', error);
    return false;
  }
};

/**
 * Clear all device storage (including device ID)
 * @returns {Promise<boolean>} - Success status
 */
export const clearAllDeviceStorage = async () => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.DEVICE_ID,
      STORAGE_KEYS.DEVICE_DATA,
    ]);
    return true;
  } catch (error) {
    console.error('Error clearing device storage:', error);
    return false;
  }
};
