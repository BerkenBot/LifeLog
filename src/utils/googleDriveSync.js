import { makeRedirectUri, useAuthRequest, ResponseType } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { generateCSVContent } from './export';

WebBrowser.maybeCompleteAuthSession();

// Client IDs - TO BE FILLED BY USER FROM GOOGLE CLOUD CONSOLE
// Web Client ID is used for Expo Go/Development
// iOS/Android Client IDs are used for standalone apps
const DISCOVERY = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const STORAGE_KEY_TOKEN = 'google_drive_refresh_token'; // Store refresh token securely

// Configuration - user needs to populate these
const CLIENT_CONFIG = {
    // We'll use a placeholder for now, user needs to update this
    clientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
    iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com',
    androidClientId: 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com',
};

// Helper to get tokens
const getTokens = async () => {
    try {
        const token = await SecureStore.getItemAsync(STORAGE_KEY_TOKEN);
        return token ? JSON.parse(token) : null;
    } catch (e) {
        console.warn('Error getting tokens', e);
        return null;
    }
};

// Helper to save tokens
const saveTokens = async (tokens) => {
    try {
        // We mainly care about the refresh token for long-term access,
        // but we'll store the whole object for now.
        await SecureStore.setItemAsync(STORAGE_KEY_TOKEN, JSON.stringify(tokens));
    } catch (e) {
        console.warn('Error saving tokens', e);
    }
};

// Function to refresh access token using refresh token
const refreshAccessToken = async (refreshToken) => {
    // This logic is complex without a backend or specific Expo libraries handling it automatically.
    // For this implementation, we will rely on the user re-authenticating if the token expires, 
    // or simple exchange if we have the endpoint.
    // Google's token endpoint supports refresh_token grant type.

    try {
        const response = await fetch(DISCOVERY.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `client_id=${CLIENT_CONFIG.clientId}&refresh_token=${refreshToken}&grant_type=refresh_token`
        });

        const data = await response.json();
        if (data.access_token) {
            return data;
        }
        return null;
    } catch (e) {
        console.warn('Failed to refresh token', e);
        return null;
    }
};

// Main Sync Service
export const GoogleDriveService = {
    // Check if user is signed in
    isSignedIn: async () => {
        const tokens = await getTokens();
        return !!tokens;
    },

    // Perform the sync
    sync: async (entries) => {
        const tokens = await getTokens();
        if (!tokens || !tokens.accessToken) {
            console.log('No Google Drive tokens found. Skipping sync.');
            return { success: false, error: 'not_authenticated' };
        }

        let accessToken = tokens.accessToken;
        // Basic check if token might be expired (this is a naive check, improved by checking actual expiry time)
        // For robust 'living' logs, handling token refresh is critical. 
        // If we have a refresh token, we should try to refresh if the access token fails.

        const csvContent = generateCSVContent(entries);
        if (!csvContent) return { success: false, error: 'no_data' };

        try {
            // 1. Search for existing file
            const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='LifeLog.csv' and trashed=false&spaces=drive`;
            const searchRes = await fetch(searchUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (searchRes.status === 401) {
                // Token expired handling would go here - for now return auth error
                return { success: false, error: 'auth_expired' };
            }

            const searchData = await searchRes.json();
            const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

            const metadata = {
                name: 'LifeLog.csv',
                mimeType: 'text/csv',
            };

            const boundary = 'foo_bar_baz';
            const delimiter = `\r\n--${boundary}\r\n`;
            const closeDelimiter = `\r\n--${boundary}--`;

            const body = delimiter +
                'Content-Type: application/json\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: text/csv\r\n\r\n' +
                csvContent +
                closeDelimiter;

            if (existingFile) {
                // Update existing file
                const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
                const updateRes = await fetch(updateUrl, {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': `multipart/related; boundary=${boundary}`,
                    },
                    body: body
                });

                if (!updateRes.ok) throw new Error('Update failed');
                console.log('Successfully updated Google Drive file');
            } else {
                // Create new file
                const createUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
                const createRes = await fetch(createUrl, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': `multipart/related; boundary=${boundary}`,
                    },
                    body: body
                });

                if (!createRes.ok) throw new Error('Creation failed');
                console.log('Successfully created Google Drive file');
            }

            return { success: true };

        } catch (e) {
            console.error('Google Drive Sync failed:', e);
            return { success: false, error: e.message };
        }
    },

    // Auth Hook Helper
    useGoogleAuth: () => {
        // Generate proper redirect URI for native app
        const redirectUri = makeRedirectUri({
            scheme: 'lifelog',
            path: 'oauthredirect',
        });

        const [request, response, promptAsync] = useAuthRequest(
            {
                clientId: CLIENT_CONFIG.clientId,
                iosClientId: CLIENT_CONFIG.iosClientId,
                androidClientId: CLIENT_CONFIG.androidClientId,
                scopes: SCOPES,
                responseType: ResponseType.Token, // Implicit flow for simplicity, or 'code' for refresh tokens (better)
                redirectUri: redirectUri,
            },
            DISCOVERY
        );

        return { request, response, promptAsync };
    },

    // Save tokens from auth response
    handleAuthResponse: async (response) => {
        if (response?.type === 'success') {
            const { authentication } = response;
            await saveTokens(authentication);
            return true;
        }
        return false;
    },

    // Sign out
    signOut: async () => {
        await SecureStore.deleteItemAsync(STORAGE_KEY_TOKEN);
    }
};
