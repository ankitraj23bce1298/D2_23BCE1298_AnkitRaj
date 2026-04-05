// App.tsx
import 'react-native-gesture-handler';

import React from 'react';
import { StatusBar, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { enableScreens } from 'react-native-screens';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import RootStack from './src/navigation';

// ✅ i18n: import instance + wrap the app so useTranslation() re-renders on language change
import i18n from './src/i18n';
import { I18nextProvider } from 'react-i18next';

enableScreens();

const App: React.FC = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <NavigationContainer>
            <StatusBar
              barStyle={Platform.OS === 'ios' ? 'dark-content' : 'dark-content'}
              backgroundColor="#ffffff"
            />
            <RootStack />
          </NavigationContainer>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
