import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Dimensions,
  StatusBar,
  Vibration,
  Modal,
  Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const GEMINI_API_KEY = "AIzaSyAOVRbnivGVGkBxL-hJVw0cT_gsyVxBYjs";

// Languages (no flags, no codes)
const languageMap = {
  en: { name: 'English' },
  hi: { name: 'हिन्दी' },
  bn: { name: 'বাংলা' },
  te: { name: 'తెలుగు' },
  mr: { name: 'मराठी' },
  ta: { name: 'தமிழ்' },
  gu: { name: 'ગુજરાતી' },
  kn: { name: 'ಕನ್ನಡ' },
  ml: { name: 'മലയാളം' },
  pa: { name: 'ਪੰਜਾਬੀ' },
  or: { name: 'ଓଡ଼ିଆ' },
  ur: { name: 'اردو' },
};

// Native welcome text per language
const welcomeTexts = {
  en: 'Hello! How can I help you today?',
  hi: 'नमस्ते! मैं आपकी किस तरह मदद कर सकता/सकती हूँ?',
  bn: 'হ্যালো! আজ আপনাকে কীভাবে সাহায্য করতে পারি?',
  te: 'హలో! నేను మీకు ఎలా సహాయం చేయగలను?',
  mr: 'नमस्कार! मी तुम्हाला आज कशी मदत करू?',
  ta: 'வணக்கம்! இன்று நான் எப்படி உதவலாம்?',
  gu: 'નમસ્તે! આજે હું કેવી રીતે મદદ કરી શકું?',
  kn: 'ನಮಸ್ಕಾರ! ನಾನು ಇಂದು ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
  ml: 'നമസ്കാരം! ഇന്ന് ഞാൻ എങ്ങനെ സഹായിക്കാം?',
  pa: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ/ਸਕਦੀ ਹਾਂ?',
  or: 'ନମସ୍କାର! ଆଜି ମୁଁ କିପରି ସହାୟତା କରିପାରେ?',
  ur: 'سلام! میں آج آپ کی کیسے مدد کر سکتا/سکتی ہوں؟',
};

// Native placeholder per language
const placeholders = {
  en: 'Type your message...',
  hi: 'अपना संदेश लिखें...',
  bn: 'আপনার বার্তা লিখুন...',
  te: 'మీ సందేశాన్ని టైప్ చేయండి...',
  mr: 'आपला संदेश टाइप करा...',
  ta: 'உங்கள் செய்தியை எழுதுங்கள்...',
  gu: 'તમારો સંદેશ લખો...',
  kn: 'ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ಬರೆಯಿರಿ...',
  ml: 'നിങ്ങളുടെ സന്ദേശം ടൈപ്പ് ചെയ്യുക...',
  pa: 'ਆਪਣਾ ਸੁਨੇਹਾ ਲਿਖੋ...',
  or: 'ଆପଣଙ୍କ ବାର୍ତ୍ତା ଟାଇପ୍ କରନ୍ତୁ...',
  ur: 'اپنا پیغام لکھیں...',
};

function getWelcome(lang) {
  return welcomeTexts[lang] || welcomeTexts.en;
}
function getPlaceholder(lang) {
  return placeholders[lang] || placeholders.en;
}

export default function ChatbotScreen({ navigation }) {
  const { t, i18n } = useTranslation();

  const [isTyping, setIsTyping] = React.useState(false);
  const [currentLanguage, setCurrentLanguage] = React.useState('en');
  const [messages, setMessages] = React.useState([
    { id: '1', from: 'bot', text: getWelcome('en'), timestamp: new Date() },
  ]);
  const [text, setText] = React.useState('');
  const [showLanguages, setShowLanguages] = React.useState(false);

  // Animations
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(22)).current;
  const buttonScaleAnim = React.useRef(new Animated.Value(1)).current;
  const dropdownScale = React.useRef(new Animated.Value(0.8)).current;
  const dropdownOpacity = React.useRef(new Animated.Value(0)).current;

  const typingDots = React.useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const flatListRef = React.useRef(null);

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  React.useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages, isTyping]);

  React.useEffect(() => {
    if (isTyping) {
      const loops = typingDots.map((dot, idx) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(idx * 140),
            Animated.timing(dot, { toValue: 1, duration: 360, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0, duration: 360, useNativeDriver: true }),
          ])
        )
      );
      Animated.parallel(loops).start();
    } else {
      typingDots.forEach((d) => d.setValue(0));
    }
  }, [isTyping]);

  const openDropdown = () => {
    setShowLanguages(true);
    dropdownScale.setValue(0.9);
    dropdownOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(dropdownScale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 90 }),
      Animated.timing(dropdownOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  };

  const closeDropdown = () => {
    Animated.parallel([
      Animated.timing(dropdownOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(dropdownScale, { toValue: 0.95, duration: 160, useNativeDriver: true }),
    ]).start(() => setShowLanguages(false));
  };

  const onSelectLanguage = (langCode) => {
    setCurrentLanguage(langCode);
    i18n.changeLanguage(langCode);
    setMessages([{
      id: '1',
      from: 'bot',
      text: getWelcome(langCode),
      timestamp: new Date(),
    }]);
    closeDropdown();
    if (Platform.OS === 'ios') Vibration.vibrate(10);
  };

  const animateButton = () => {
    Animated.sequence([
      Animated.timing(buttonScaleAnim, { toValue: 0.96, duration: 90, useNativeDriver: true }),
      Animated.spring(buttonScaleAnim, { toValue: 1, useNativeDriver: true, friction: 4, tension: 120 }),
    ]).start();
  };

  async function send() {
    if (!text.trim() || isTyping) return;

    animateButton();

    const userMsg = {
      id: Date.now().toString(),
      from: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setText('');
    setIsTyping(true);

    const languageName = languageMap[currentLanguage]?.name || 'English';
    const prompt = `Respond ONLY in ${languageName}. Keep the same language throughout. User's message: "${userMsg.text}"`;

    try {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error?.message || 'API request failed');
      }

      const data = await resp.json();

      if (!data.candidates || data.candidates.length === 0) {
        const blockReason = data.promptFeedback?.blockReason || 'safety reasons';
        throw new Error(`Response was blocked for ${blockReason}.`);
      }

      const botReply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        (placeholders[currentLanguage] || placeholders.en);

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-bot`,
          from: 'bot',
          text: botReply.trim(),
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      const errorMessage = err?.message?.includes('quota')
        ? "Error: You've exceeded the free request limit. Please wait a minute and try again."
        : `Error: ${err.message}`;
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          from: 'bot',
          text: errorMessage,
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  const formatTime = (timestamp) =>
    timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const renderTypingIndicator = () => (
    <Animated.View style={[styles.typingContainer, { opacity: fadeAnim }]}>
      <View style={styles.botAvatarContainer}>
        <View style={styles.botAvatarBubble}><Text style={styles.botAvatar}>🤖</Text></View>
        <View style={styles.onlineIndicator} />
      </View>
      <View style={[styles.msg, styles.bot, styles.typingMsg]}>
        <View style={styles.typingDots}>
          {typingDots.map((dot, index) => (
            <Animated.View
              key={index}
              style={[
                styles.typingDot,
                {
                  opacity: dot,
                  transform: [{
                    translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }),
                  }],
                },
              ]}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );

  const renderItem = ({ item }) => (
    <Animated.View
      style={[
        styles.msgContainer,
        item.from === 'bot' ? styles.botContainer : styles.userContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {item.from === 'bot' && (
        <View style={styles.botAvatarContainer}>
          <View style={styles.botAvatarBubble}><Text style={styles.botAvatar}>🤖</Text></View>
          <View style={styles.onlineIndicator} />
        </View>
      )}

      <View style={styles.msgContent}>
        <View
          style={[
            styles.msg,
            item.from === 'bot' ? styles.bot : styles.user,
            item.isError && styles.errorMsg,
          ]}
        >
          <Text
            style={[
              item.from === 'bot' ? styles.botMsgText : styles.userMsgText,
              item.isError && styles.errorMsgText,
            ]}
          >
            {item.text}
          </Text>
        </View>
        <Text
          style={[
            styles.timestamp,
            item.from === 'user' && styles.userTimestamp,
          ]}
        >
          {formatTime(item.timestamp)}
        </Text>
      </View>
    </Animated.View>
  );

  const LanguageDropdown = () => (
    <Modal
      visible={showLanguages}
      transparent
      animationType="none"
      onRequestClose={closeDropdown}
    >
      <Pressable style={styles.modalBackdrop} onPress={closeDropdown}>
        <Animated.View
          style={[
            styles.dropdownCard,
            { opacity: dropdownOpacity, transform: [{ scale: dropdownScale }] },
          ]}
        >
          <Text style={styles.dropdownTitle}>Choose Language</Text>
          <View style={styles.dropdownDivider} />
          <View style={styles.dropdownList}>
            {Object.entries(languageMap).map(([code, info]) => {
              const active = currentLanguage === code;
              return (
                <TouchableOpacity
                  key={code}
                  style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                  activeOpacity={0.85}
                  onPress={() => onSelectLanguage(code)}
                >
                  <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                    {info.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerInner}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>AI Assistant</Text>
            <Text style={styles.headerSubtitle}>Powered by Gemini</Text>
          </View>

          <TouchableOpacity
            style={styles.languageToggle}
            activeOpacity={0.9}
            onPress={openDropdown}
          >
            <Text style={styles.currentLangName}>
              {languageMap[currentLanguage]?.name}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          showsVerticalScrollIndicator={false}
        />

        {isTyping && renderTypingIndicator()}

        {/* Input */}
        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <View style={styles.inputWrapper}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={getPlaceholder(currentLanguage)}
                style={styles.input}
                multiline
                maxLength={1000}
                placeholderTextColor="#9CA3AF"
              />
              {text.length > 0 && (
                <Text style={styles.charCount}>{text.length}/1000</Text>
              )}
            </View>

            <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
              <TouchableOpacity
                onPress={send}
                style={[
                  styles.sendButton,
                  (!text.trim() || isTyping) && styles.sendButtonDisabled,
                ]}
                disabled={!text.trim() || isTyping}
                activeOpacity={0.9}
              >
                <View
                  style={[
                    styles.sendButtonContent,
                    (!text.trim() || isTyping) && styles.sendButtonContentDisabled,
                  ]}
                >
                  {isTyping ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.sendIcon}>✈️</Text>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <LanguageDropdown />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F172A' },

  headerContainer: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    elevation: 8,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleContainer: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, fontWeight: '600' },

  languageToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  currentLangName: { color: '#FFFFFF', fontWeight: '700' },

  container: { flex: 1, backgroundColor: '#F8FAFC' },
  list: { flex: 1 },
  listContent: { paddingVertical: 20, paddingHorizontal: 16 },

  msgContainer: { marginVertical: 8, maxWidth: '100%' },
  botContainer: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'flex-end' },
  userContainer: { alignSelf: 'flex-end', flexDirection: 'row-reverse', alignItems: 'flex-end' },
  msgContent: { maxWidth: width * 0.75 },

  botAvatarContainer: { position: 'relative', marginRight: 12, marginBottom: 20 },
  botAvatarBubble: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
  },
  botAvatar: { fontSize: 18 },
  onlineIndicator: {
    position: 'absolute', bottom: -2, right: -2,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#10B981', borderWidth: 2, borderColor: '#FFFFFF',
  },

  msg: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  bot: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  user: {
    backgroundColor: '#3B82F6',
    borderTopRightRadius: 6,
  },
  errorMsg: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },

  botMsgText: { color: '#1F2937', fontSize: 16, lineHeight: 22 },
  userMsgText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22 },
  errorMsgText: { color: '#991B1B' },

  timestamp: { fontSize: 12, color: '#9CA3AF', marginTop: 6, marginLeft: 4 },
  userTimestamp: { textAlign: 'right', marginLeft: 0, marginRight: 4 },

  typingContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingBottom: 12 },
  typingMsg: { paddingVertical: 16, minHeight: 50 },
  typingDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9CA3AF', marginHorizontal: 2 },

  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 12,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    marginRight: 12,
    position: 'relative',
  },
  input: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 16,
    maxHeight: 120,
    color: '#1F2937',
  },
  charCount: { position: 'absolute', bottom: 4, right: 12, fontSize: 10, color: '#9CA3AF' },

  sendButton: {
    width: 50, height: 50, borderRadius: 25,
    shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  sendButtonDisabled: { opacity: 0.6, shadowOpacity: 0.08 },
  sendButtonContent: {
    flex: 1, backgroundColor: '#3B82F6', borderRadius: 25,
    justifyContent: 'center', alignItems: 'center',
  },
  sendButtonContentDisabled: { backgroundColor: '#9CA3AF' },
  sendIcon: { fontSize: 20, color: '#fff' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingHorizontal: 16,
  },
  dropdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  dropdownTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', paddingHorizontal: 6, paddingTop: 2 },
  dropdownDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 10 },
  dropdownList: { gap: 8 },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dropdownItemActive: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  dropdownItemText: { fontSize: 15, color: '#111827', fontWeight: '600' },
  dropdownItemTextActive: { color: '#1E3A8A' },
});
