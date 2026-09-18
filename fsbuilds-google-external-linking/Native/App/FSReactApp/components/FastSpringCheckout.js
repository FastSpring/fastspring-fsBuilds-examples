// FastSpring Checkout using Expo WebBrowser
import React, { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';

const FastSpringCheckout = ({ visible, checkoutUrl, onClose }) => {
  useEffect(() => {
    if (visible && checkoutUrl) {
      openCheckout();
    }
  }, [visible, checkoutUrl]);

  const openCheckout = async () => {
    try {
      console.log('[FastSpringCheckout] Opening URL:', checkoutUrl);

      const result = await WebBrowser.openBrowserAsync(checkoutUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: '#6B4CE6',
      });

      console.log('[FastSpringCheckout] Browser closed:', result);

      // Call onClose when browser is dismissed
      if (result.type === 'cancel' || result.type === 'dismiss') {
        onClose();
      }
    } catch (error) {
      console.error('[FastSpringCheckout] Error opening browser:', error);
      onClose();
    }
  };

  // This component doesn't render anything - it just opens the browser
  return null;
};

export default FastSpringCheckout;
