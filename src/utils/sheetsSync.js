import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateCSVContent } from './export';

const SHEETS_URL_KEY = 'google_sheets_script_url';

/**
 * Simple Google Sheets Sync Service
 * Uses a Google Apps Script web app to sync data to a Google Sheet
 * No OAuth required - just paste the web app URL
 */
export const SheetsSync = {
    // Get saved URL
    getUrl: async () => {
        try {
            return await AsyncStorage.getItem(SHEETS_URL_KEY);
        } catch (e) {
            console.warn('Error getting sheets URL:', e);
            return null;
        }
    },

    // Save URL
    saveUrl: async (url) => {
        try {
            if (url) {
                await AsyncStorage.setItem(SHEETS_URL_KEY, url.trim());
            } else {
                await AsyncStorage.removeItem(SHEETS_URL_KEY);
            }
            return true;
        } catch (e) {
            console.warn('Error saving sheets URL:', e);
            return false;
        }
    },

    // Check if configured
    isConfigured: async () => {
        const url = await SheetsSync.getUrl();
        return !!url && url.length > 0;
    },

    // Sync all entries to Google Sheet
    syncAll: async (entries) => {
        const url = await SheetsSync.getUrl();
        if (!url) {
            return { success: false, error: 'not_configured' };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'sync_all',
                    entries: entries,
                }),
            });

            // Google Apps Script returns 302 redirect, so we check for that too
            if (response.ok || response.status === 302) {
                console.log('Successfully synced to Google Sheets');
                return { success: true };
            }

            const text = await response.text();
            console.warn('Sheets sync failed:', response.status, text);
            return { success: false, error: `HTTP ${response.status}` };
        } catch (e) {
            console.warn('Sheets sync error:', e);
            return { success: false, error: e.message };
        }
    },

    // Add a single entry
    addEntry: async (entry) => {
        const url = await SheetsSync.getUrl();
        if (!url) {
            return { success: false, error: 'not_configured' };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'add_entry',
                    entry: entry,
                }),
            });

            if (response.ok || response.status === 302) {
                console.log('Successfully added entry to Google Sheets');
                return { success: true };
            }

            return { success: false, error: `HTTP ${response.status}` };
        } catch (e) {
            console.warn('Sheets add entry error:', e);
            return { success: false, error: e.message };
        }
    },

    // Test connection
    testConnection: async () => {
        const url = await SheetsSync.getUrl();
        if (!url) {
            return { success: false, error: 'No URL configured' };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'test',
                }),
            });

            if (response.ok || response.status === 302) {
                return { success: true };
            }

            return { success: false, error: `HTTP ${response.status}` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },
};

/**
 * Google Apps Script Code Template
 * 
 * Instructions for user:
 * 1. Create a new Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace the code with the content below
 * 4. Deploy > New deployment > Web app
 * 5. Set "Execute as" to your account
 * 6. Set "Who has access" to "Anyone"
 * 7. Deploy and copy the URL
 * 8. Paste the URL in LifeLog app settings
 */
export const APPS_SCRIPT_TEMPLATE = `
// LifeLog Google Apps Script
// Paste this code in your Google Sheet's Apps Script editor

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);
    
    if (data.action === 'test') {
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (data.action === 'sync_all') {
      // Clear existing data (except header) and replace with all entries
      const entries = data.entries || [];
      
      // Set up headers if sheet is empty
      if (sheet.getLastRow() === 0) {
        const headers = [
          'ID', 'Date', 'Time', 'Timestamp', 'Mood',
          'Stress', 'Energy', 'Clarity', 'Motivation', 'Fulfillment', 'Loved',
          'Note', 'Steps', 'Sleep', 'Heart Rate', 'Calories', 'Exercise Minutes',
          'Went Well', 'Did Not Go Well', 'Grateful For'
        ];
        sheet.appendRow(headers);
      }
      
      // Clear all data rows (keep header)
      if (sheet.getLastRow() > 1) {
        sheet.deleteRows(2, sheet.getLastRow() - 1);
      }
      
      // Add all entries
      entries.forEach(function(entry) {
        const row = [
          entry.id || '',
          entry.date || '',
          entry.time || '',
          entry.timestamp || '',
          entry.mood || '',
          entry.stress || '',
          entry.energy || '',
          entry.clarity || '',
          entry.motivation || '',
          entry.fulfillment || '',
          entry.loved || '',
          entry.note || '',
          entry.steps || '',
          entry.sleep || '',
          entry.heartRate || '',
          entry.calories || '',
          entry.exerciseMinutes || '',
          entry.wentWell || '',
          entry.didNotGoWell || '',
          entry.gratefulFor || ''
        ];
        sheet.appendRow(row);
      });
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: entries.length }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (data.action === 'add_entry') {
      const entry = data.entry;
      
      // Set up headers if sheet is empty
      if (sheet.getLastRow() === 0) {
        const headers = [
          'ID', 'Date', 'Time', 'Timestamp', 'Mood',
          'Stress', 'Energy', 'Clarity', 'Motivation', 'Fulfillment', 'Loved',
          'Note', 'Steps', 'Sleep', 'Heart Rate', 'Calories', 'Exercise Minutes',
          'Went Well', 'Did Not Go Well', 'Grateful For'
        ];
        sheet.appendRow(headers);
      }
      
      const row = [
        entry.id || '',
        entry.date || '',
        entry.time || '',
        entry.timestamp || '',
        entry.mood || '',
        entry.stress || '',
        entry.energy || '',
        entry.clarity || '',
        entry.motivation || '',
        entry.fulfillment || '',
        entry.loved || '',
        entry.note || '',
        entry.steps || '',
        entry.sleep || '',
        entry.heartRate || '',
        entry.calories || '',
        entry.exerciseMinutes || '',
        entry.wentWell || '',
        entry.didNotGoWell || '',
        entry.gratefulFor || ''
      ];
      sheet.appendRow(row);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput('LifeLog Sync Service is running!')
    .setMimeType(ContentService.MimeType.TEXT);
}
`;
