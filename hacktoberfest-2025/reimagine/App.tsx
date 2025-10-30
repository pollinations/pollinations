import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import TransformationService from './src/services/TransformationService';

function AppContent() {
  const { isDark } = useTheme();

  useEffect(() => {
    const initializeServices = async () => {
      try {
        console.log('🚀 Initializing ReImagine services...');
        
        await TransformationService.cleanup();
        
        console.log('✅ ReImagine services initialized successfully');
      } catch (error) {
        console.error('❌ Error initializing services:', error);
      }
    };

    initializeServices();
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Navigation />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <ThemeProvider>
            <AppContent />
          </ThemeProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}