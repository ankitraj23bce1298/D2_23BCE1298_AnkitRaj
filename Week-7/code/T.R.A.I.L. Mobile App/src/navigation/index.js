// src/navigation/index.js
import React from 'react';
import { Platform, Image, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import SplashScreen from '../screens/SplashScreen';
import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import GroupModeScreen from '../screens/GroupModeScreen';
import ChatbotScreen from '../screens/ChatbotScreen';
import KYCFormScreen from '../screens/KYCFormScreen';
import FamilyScreen from '../screens/FamilyScreen';
import FamilyMapScreen from '../screens/FamilyMapScreen';
import QRCodeScreen from '../screens/QRCodeScreen';
import SOSScreen from '../screens/SOSScreen';

const ICONS = {
  home: require('../assets/icons/home.png'),
  family: require('../assets/icons/family.png'),
  profile: require('../assets/icons/profile.png'),
  map: require('../assets/icons/map.png'),
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/* Custom Tab Bar with center SOS button */
function CustomTabBar({ state, descriptors, navigation }) {
  return (
    <View style={styles.tabBarContainer}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key] || {};
        const label = options?.title ?? route.name;
        const isFocused = state.index === index;

        const isCenter = route.name === 'SOSTab';
        if (isCenter) {
          return (
            <View key={route.key} style={styles.centerSlot}>
              <TouchableOpacity
                onPress={() => navigation.navigate('SOSTab')}
                activeOpacity={0.9}
                style={styles.centerButton}
              >
                <Text style={styles.centerButtonText}>SOS</Text>
              </TouchableOpacity>
            </View>
          );
        }

        // icon per tab
        let iconSource = ICONS.home;
        if (route.name === 'HomeTab') iconSource = ICONS.home;
        else if (route.name === 'FamilyTab') iconSource = ICONS.family;
        else if (route.name === 'ProfileTab') iconSource = ICONS.profile;
        else if (route.name === 'MapTab') iconSource = ICONS.map;

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            onPress={() => navigation.navigate(route.name)}
            style={styles.tabButton}
            activeOpacity={0.8}
          >
            <Image
              source={iconSource}
              style={{
                width: 22,
                height: 22,
                tintColor: isFocused ? '#1976D2' : '#8a8a8a',
                resizeMode: 'contain',
              }}
            />
            {/* hide any text for the center SOS slot only */}
            <Text style={[styles.tabLabel, { color: isFocused ? '#1976D2' : '#666' }]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="MapTab"
        component={FamilyMapScreen}
        options={{ title: 'Map' }}
      />
      {/* Center SOS tab - rendered by the big button above */}
      <Tab.Screen
        name="SOSTab"
        component={SOSScreen}
        options={{
          title: '',            // keep label empty
          tabBarShowLabel: false,
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="FamilyTab"
        component={FamilyScreen}
        options={{ title: 'Family' }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export default function RootStack() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Auth" component={AuthScreen} />
      <Stack.Screen name="KYC" component={KYCFormScreen} />
      <Stack.Screen name="MainTabs" component={AppTabs} />

      {/* These keep deep links working if you navigate outside tabs */}
      <Stack.Screen name="Family" component={FamilyScreen} />
      <Stack.Screen name="FamilyMap" component={FamilyMapScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Group" component={GroupModeScreen} />

      {/* Chatbot and QR code screens (full-screen, no header) */}
      <Stack.Screen
        name="Chatbot"
        component={ChatbotScreen}
        options={{ headerShown: false, animation: 'fade' }}
      />
      <Stack.Screen
        name="QRCode"
        component={QRCodeScreen}
        options={{ headerShown: false, presentation: 'containedModal' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 84 : 66,
    paddingHorizontal: 12,
    paddingBottom: 3,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  centerSlot: {
    width: 92,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28, // pull up to overlap tab bar
  },
  centerButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E53935',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  centerButtonText: { color: '#fff', fontWeight: '900', fontSize: 20 },
});
