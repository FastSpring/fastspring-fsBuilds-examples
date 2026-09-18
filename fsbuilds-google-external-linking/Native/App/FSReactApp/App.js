import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef } from 'react';
import { Text, View, ScrollView, Image, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { styles } from './styles';
import { login } from './services/authService';
import { checkSubscription } from './services/subscriptionService';
import { prepareCheckoutUrl } from './services/purchaseService';
import FastSpringCheckout from './components/FastSpringCheckout';

function AppContent() {
  const insets = useSafeAreaInsets();
  const [hasSubscription, setHasSubscription] = useState(false);
  const [subscriptionState, setSubscriptionState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginData, setLoginData] = useState(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const isProcessingDeepLink = useRef(false);
  const pollingIntervalRef = useRef(null);

  // Auto-login and check subscription on app startup
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Step 1: Login
        const loginResult = await login();

        if (!loginResult.success) {
          console.error('Login failed:', loginResult.error);
          setIsLoading(false);
          return;
        }

        setLoginData(loginResult.data);

        // Step 2: Check subscription status
        const subscriptionResult = await checkSubscription(
          loginResult.data.token,
          loginResult.data.playerId
        );

        if (subscriptionResult.success) {
          setHasSubscription(subscriptionResult.isActive);
          setSubscriptionState(subscriptionResult.state);
        } else {
          console.error('Subscription check failed:', subscriptionResult.error);
          setHasSubscription(false);
          setSubscriptionState(null);
        }
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  // Poll subscription status every 30 seconds
  useEffect(() => {
    if (!loginData || !loginData.token || !loginData.playerId || showCheckout) {
      return;
    }

    const checkSubscriptionStatus = async () => {
      try {
        const subscriptionResult = await checkSubscription(
          loginData.token,
          loginData.playerId
        );

        if (subscriptionResult.success) {
          setHasSubscription(subscriptionResult.isActive);
          setSubscriptionState(subscriptionResult.state);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    pollingIntervalRef.current = setInterval(checkSubscriptionStatus, 30000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [loginData, showCheckout]);

  // Handle deep link from FastSpring purchase completion
  useEffect(() => {
    const handleDeepLink = async (event) => {
      const url = event.url;
      console.log('[App] Deep link received:', url);

      // Check if this is a purchase completion link
      if (url && url.startsWith('fsreactapp://purchase-complete')) {
        // Prevent duplicate processing
        if (isProcessingDeepLink.current) {
          console.log('[App] Already processing deep link, skipping...');
          return;
        }

        isProcessingDeepLink.current = true;
        console.log('[App] Subscription purchase completion detected');

        // Close the Safari browser
        WebBrowser.dismissBrowser();
        console.log('[App] Browser dismissed');

        // Close the checkout modal
        setShowCheckout(false);

        // Refresh subscription status
        if (loginData && loginData.token && loginData.playerId) {
          setIsLoading(true);

          try {
            const subscriptionResult = await checkSubscription(
              loginData.token,
              loginData.playerId
            );

            if (subscriptionResult.success) {
              setHasSubscription(subscriptionResult.isActive);
              setSubscriptionState(subscriptionResult.state);

              if (subscriptionResult.isActive) {
                Alert.alert('Success!', 'Your subscription is now active!');
              } else {
                Alert.alert('Thank you!', 'Your subscription purchase is being processed. Please check back in a few moments.');
              }
            }
          } catch (error) {
            console.error('[App] Error refreshing subscription after deep link:', error);
          } finally {
            setIsLoading(false);
            // Reset flag after a short delay
            setTimeout(() => {
              isProcessingDeepLink.current = false;
            }, 2000);
          }
        } else {
          // Reset flag if no login data
          setTimeout(() => {
            isProcessingDeepLink.current = false;
          }, 2000);
        }
      }
    };

    // Subscribe to deep link events
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was launched with a deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loginData]);

  // Handle purchase button click
  const handlePurchase = async () => {
    if (!loginData || !loginData.token) {
      Alert.alert('Error', 'Please wait for login to complete');
      return;
    }

    setIsLoading(true);

    try {
      const result = await prepareCheckoutUrl(loginData.token);

      if (result.success) {
        setCheckoutUrl(result.checkoutUrl);
        setShowCheckout(true);
      } else {
        Alert.alert('Error', 'Failed to prepare checkout. Please try again.');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle checkout close and refresh subscription
  const handleCheckoutClose = async () => {
    setShowCheckout(false);
    setIsLoading(true);

    try {
      const subscriptionResult = await checkSubscription(
        loginData.token,
        loginData.playerId
      );

      if (subscriptionResult.success) {
        setHasSubscription(subscriptionResult.isActive);
        setSubscriptionState(subscriptionResult.state);

        // Don't show alert here - the deep link handler will show it
      }
    } catch (error) {
      console.error('Error refreshing subscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading overlay while logging in
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="auto" />
        <ActivityIndicator size="large" color="#6B4CE6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top Menu Bar */}
      <View style={[styles.topMenuContainer, { paddingTop: insets.top }]}>
        <View style={styles.topMenu}>
        {/* Logo */}
        <Image
          source={require('./assets/pixelforge_logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* User Badge - only show when subscription is active */}
        {hasSubscription && (
          <TouchableOpacity
            style={styles.userBadge}
            onPress={async () => {
              // Re-check subscription status from API
              const subscriptionResult = await checkSubscription(
                loginData.token,
                loginData.playerId
              );
              if (subscriptionResult.success) {
                setHasSubscription(subscriptionResult.isActive);
                setSubscriptionState(subscriptionResult.state);
              }
            }}
          >
            <View style={styles.userCircle} />
            <Text style={styles.userText}>User 1224</Text>
          </TouchableOpacity>
        )}
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        alwaysBounceVertical={true}
      >
        {!hasSubscription ? (
          // Pre-page: Subscription Offer
          <>
            {/* Photo App Logo */}
            <View style={styles.logoContainer}>
              <Text style={styles.logoPlaceholder}>FPO</Text>
              <Text style={styles.logoSubtext}>{'<Photo App Logo>'}</Text>
            </View>

            {/* Subscription Info Card */}
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionInfo}>
                <Text style={styles.subscriptionTitle}>Photo App Access</Text>
                <Text style={styles.subscriptionTitle}>Monthly</Text>
                <Text style={styles.subscriptionTitle}>Subscription</Text>
                <Text style={styles.subscriptionPrice}>$4.99</Text>
              </View>
            </View>

            {/* Buttons */}
            <TouchableOpacity
              style={styles.button}
            >
              <Image
                source={require('./assets/button-app store.png')}
                style={styles.buttonBackground}
                resizeMode="cover"
              />
              <Text style={styles.buttonText}></Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={handlePurchase}
            >
              <Image
                source={require('./assets/button-direct.png')}
                style={styles.buttonBackground}
                resizeMode="cover"
              />
              <Text style={styles.buttonText}></Text>
            </TouchableOpacity>
          </>
        ) : (
          // Subscription Active: Show subscription content
          <>
            {/* Quick Access Section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Quick Access</Text>
              <TouchableOpacity style={styles.listItem}>
                <Text style={styles.listItemText}>Upload</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.listItem}>
                <Text style={styles.listItemText}>Shared Albums</Text>
              </TouchableOpacity>
            </View>

            {/* Feature Cards Row */}
            <View style={styles.featureRow}>
              <View style={styles.featureCard}>
                <Text style={styles.featureTitle}>RAW Photo</Text>
                <Text style={styles.featureTitle}>Editing Tool</Text>
              </View>
              <View style={styles.featureCard}>
                <Text style={styles.featureTitle}>Premium</Text>
                <Text style={styles.featureTitle}>Tutorials</Text>
              </View>
            </View>

            {/* Seasonal Offer Section */}
            <View style={styles.offerCard}>
              <Text style={styles.offerTitle}>Seasonal Offer</Text>
              <Text style={styles.offerSubtitle}>Holiday Presets Pack</Text>

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.halfButton}>
                  <Text style={styles.halfButtonText}>Buy on App</Text>
                  <Text style={styles.halfButtonText}>Store</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.halfButton}>
                  <Text style={styles.halfButtonText}>Buy Direct</Text>
                  <Text style={styles.halfButtonSubtext}>Unlock</Text>
                  <Text style={styles.halfButtonSubtext}>Additional</Text>
                  <Text style={styles.halfButtonSubtext}>Presets</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Player ID Display at bottom */}
      {loginData && loginData.playerId && (
        <View style={[styles.playerIdContainer, { paddingBottom: insets.bottom }]}>
          <View style={styles.playerIdRow}>
            <Text style={styles.playerIdLabel}>PlayerId:</Text>
            <Text style={styles.playerIdValue}>{loginData.playerId}</Text>
          </View>
          <View style={styles.playerIdRow}>
            <Text style={styles.playerIdLabel}>Subscription:</Text>
            <Text style={styles.playerIdValue}>{subscriptionState || 'N/A'}</Text>
          </View>
        </View>
      )}

      {/* FastSpring Checkout Modal */}
      <FastSpringCheckout
        visible={showCheckout}
        checkoutUrl={checkoutUrl}
        onClose={handleCheckoutClose}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
