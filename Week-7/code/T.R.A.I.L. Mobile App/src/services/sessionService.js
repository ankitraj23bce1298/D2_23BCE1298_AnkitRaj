import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

const PROFILE_PREFIX = 'profile_';
const TOKEN_KEY = 'token';
const FAMILY_INDEX_KEY = 'family_index';
const cache = {}; // In-memory cache for synchronous access

// --- Private Helper Functions ---
async function getFamilyIndex() {
  try {
    const rawIndex = await AsyncStorage.getItem(FAMILY_INDEX_KEY);
    return rawIndex ? JSON.parse(rawIndex) : {};
  } catch {
    return {};
  }
}

async function saveFamilyIndex(index) {
  try {
    await AsyncStorage.setItem(FAMILY_INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.warn('saveFamilyIndex error', e);
  }
}

// --- Public Service ---
export default {
  /**
   * Saves a user profile to both in-memory cache and AsyncStorage.
   * Also updates the family index if a familyId is present.
   * @param {string} uid - The user's ID.
   * @param {object} profile - The user's profile object.
   */
  async saveProfile(uid, profile) {
    if (!uid || !profile) return;
    cache[uid] = profile;
    try {
      await AsyncStorage.setItem(PROFILE_PREFIX + uid, JSON.stringify(profile));
      
      // Update the family index if the profile has a family ID
      if (profile.familyId) {
        const familyIndex = await getFamilyIndex();
        familyIndex[profile.familyId] = familyIndex[profile.familyId] || [];
        if (!familyIndex[profile.familyId].includes(uid)) {
          familyIndex[profile.familyId].push(uid);
        }
        await saveFamilyIndex(familyIndex);
      }
    } catch (e) {
      console.warn('saveProfile error', e);
    }
  },

  /**
   * Synchronously gets a profile from the in-memory cache.
   * @param {string} uid - The user's ID.
   * @returns {object|null} The cached profile or null.
   */
  getProfile(uid) {
    if (!uid) return null;
    return cache[uid] || null;
  },

  /**
   * Asynchronously loads a profile from AsyncStorage into the cache.
   * @param {string} uid - The user's ID.
   * @returns {Promise<object|null>} The loaded profile or null.
   */
  async loadProfileAsync(uid) {
    if (!uid) return null;
    // Check cache first
    if (cache[uid]) return cache[uid];
    
    try {
      const raw = await AsyncStorage.getItem(PROFILE_PREFIX + uid);
      if (!raw) return null;
      const profile = JSON.parse(raw);
      cache[uid] = profile; // Update cache
      return profile;
    } catch (e) {
      console.warn('loadProfileAsync error', e);
      return null;
    }
  },

  /**
   * Fetches a profile from the backend, saves it locally, and returns it.
   * It also normalizes emergencyContacts if they are stored as a JSON string.
   * @param {string} uid - The user's ID.
   * @returns {Promise<object|null>} The fetched profile or null.
   */
  async loadProfileFromBackend(uid) {
    if (!uid) return null;
    try {
      const response = await apiFetch(`/profiles/${uid}`, { method: 'GET' });
      if (response.ok && response.body) {
        const profile = response.body;

        // Normalize emergencyContacts from JSON string to array if necessary
        if (profile.emergencyContacts && typeof profile.emergencyContacts === 'string') {
          try {
            profile.emergencyContacts = JSON.parse(profile.emergencyContacts);
          } catch {
            profile.emergencyContacts = [];
          }
        }
        
        await this.saveProfile(uid, profile);
        return profile;
      }
    } catch (e) {
      console.warn('loadProfileFromBackend error', e);
    }
    return null;
  },

  /**
   * Attempts to find the current user's profile on app start.
   * It checks in-memory cache first, then AsyncStorage.
   * @returns {Promise<object|null>} The current user's profile or null.
   */
  async getCurrentUser() {
    const cachedKeys = Object.keys(cache);
    if (cachedKeys.length > 0) {
      return cache[cachedKeys[0]];
    }

    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const profileKey = allKeys.find(key => key.startsWith(PROFILE_PREFIX));
      
      if (profileKey) {
        const uid = profileKey.replace(PROFILE_PREFIX, '');
        return await this.loadProfileAsync(uid);
      }
    } catch (e) {
      console.warn('getCurrentUser error', e);
    }
    return null;
  },

  /**
   * Clears a user's profile from cache, AsyncStorage, and the family index.
   * @param {string} uid - The user's ID.
   * @param {string} familyId - The user's family ID.
   */
  async clearProfile(uid, familyId) {
    if (uid) {
      delete cache[uid];
      try {
        await AsyncStorage.removeItem(PROFILE_PREFIX + uid);
        if (familyId) {
            const familyIndex = await getFamilyIndex();
            if (familyIndex[familyId]) {
                familyIndex[familyId] = familyIndex[familyId].filter(id => id !== uid);
                await saveFamilyIndex(familyIndex);
            }
        }
      } catch (e) {
        console.warn('clearProfile error', e);
      }
    }
  },

  // --- Family & Group Helpers ---

  /**
   * Finds the owner of a family.
   * @param {string} familyId - The family ID.
   * @returns {Promise<object|null>} The owner's profile or null.
   */
  async findOwnerByFamilyId(familyId) {
    if (!familyId) return null;
    const familyIndex = await getFamilyIndex();
    const memberIds = familyIndex[familyId] || [];

    for (const uid of memberIds) {
      const profile = await this.loadProfileAsync(uid);
      if (profile && profile.isFamilyOwner) {
        return profile;
      }
    }
    return null;
  },

  /**
   * Gets all member profiles for a given family ID.
   * @param {string} familyId - The family ID.
   * @returns {Promise<Array<object>>} An array of member profiles.
   */
  async getFamilyMembers(familyId) {
    if (!familyId) return [];
    const familyIndex = await getFamilyIndex();
    const memberIds = familyIndex[familyId] || [];
    
    const memberProfiles = await Promise.all(
      memberIds.map(uid => this.loadProfileAsync(uid))
    );
    
    return memberProfiles.filter(p => p !== null); // Filter out any null profiles
  },

  /**
   * Updates a user's live location in storage.
   * @param {string} uid - The user's ID.
   * @param {number} lat - Latitude.
   * @param {number} lng - Longitude.
   */
  async updateLocation(uid, lat, lng) {
    const profile = await this.loadProfileAsync(uid);
    if (profile) {
      profile.location = { lat, lng, updatedAt: new Date().toISOString() };
      profile.status = 'online';
      await this.saveProfile(uid, profile);
    }
  },
  
  // --- Token Helpers ---
  async saveToken(token) {
    try {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      console.warn('saveToken error', e);
    }
  },

  async getToken() {
    try {
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async clearToken() {
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.warn('clearToken error', e);
    }
  },

  // --- ID Generators ---
  generateFamilyId() {
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `FAM-${randomPart}`;
  },

  generateIndividualId(name = '') {
    const namePart = (name || 'USER').split(' ')[0].substr(0, 3).toUpperCase();
    const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `IND-${namePart}-${randomPart}`;
  },
};