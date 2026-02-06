import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY } from './constants';
import { SheetsSync } from './sheetsSync';

export const storage = {
  async getEntries() {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      return json ? JSON.parse(json) : [];
    } catch (e) {
      console.error('Failed to load entries:', e);
      return [];
    }
  },

  async saveEntries(entries) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));

      // Attempt background sync to Google Sheets
      SheetsSync.syncAll(entries).catch(err =>
        console.log('Background sync failed (silent):', err)
      );

      return true;
    } catch (e) {
      console.error('Failed to save entries:', e);
      return false;
    }
  },

  async addEntry(entry) {
    const entries = await this.getEntries();
    const updated = [entry, ...entries].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    return this.saveEntries(updated);
  },

  async updateEntry(id, updatedEntry) {
    const entries = await this.getEntries();
    const updated = entries.map(e => (e.id === id ? updatedEntry : e));
    return this.saveEntries(updated);
  },

  async deleteEntry(id) {
    const entries = await this.getEntries();
    const updated = entries.filter(e => e.id !== id);
    return this.saveEntries(updated);
  },

  async clearAll() {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      console.error('Failed to clear entries:', e);
      return false;
    }
  },

  // Settings
  async getUserSettings() {
    try {
      const json = await AsyncStorage.getItem('@lifelog_user_settings');
      return json ? JSON.parse(json) : { sleepGoal: 8, exerciseGoal: 30 };
    } catch (e) {
      return { sleepGoal: 8, exerciseGoal: 30 };
    }
  },

  async saveUserSettings(settings) {
    try {
      await AsyncStorage.setItem('@lifelog_user_settings', JSON.stringify(settings));
      return true;
    } catch (e) {
      return false;
    }
  },
};
