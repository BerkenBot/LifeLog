// GitHub Gist Sync Service for LifeLog
// Syncs data to a public GitHub Gist for easy sharing

import AsyncStorage from '@react-native-async-storage/async-storage';

const GIST_TOKEN_KEY = '@lifelog_gist_token';
const GIST_ID_KEY = '@lifelog_gist_id';

class GistSyncService {
    async getToken() {
        return await AsyncStorage.getItem(GIST_TOKEN_KEY);
    }

    async saveToken(token) {
        await AsyncStorage.setItem(GIST_TOKEN_KEY, token);
    }

    async getGistId() {
        return await AsyncStorage.getItem(GIST_ID_KEY);
    }

    async saveGistId(id) {
        await AsyncStorage.setItem(GIST_ID_KEY, id);
    }

    async isConfigured() {
        const token = await this.getToken();
        return !!token;
    }

    async getGistUrl() {
        const gistId = await this.getGistId();
        if (!gistId) return null;
        return `https://gist.github.com/${gistId}`;
    }

    async testConnection() {
        try {
            const token = await this.getToken();
            if (!token) return { success: false, error: 'No token configured' };

            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                },
            });

            if (response.ok) {
                const user = await response.json();
                return { success: true, username: user.login };
            } else {
                return { success: false, error: 'Invalid token' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async syncAll(entries) {
        try {
            const token = await this.getToken();
            if (!token) return { success: false, error: 'No token configured' };

            // Format data as JSON for the Gist
            const data = {
                lastUpdated: new Date().toISOString(),
                entries: entries.sort((a, b) => {
                    // Sort by date descending, then time descending
                    if (a.date !== b.date) return b.date.localeCompare(a.date);
                    return (b.time || '').localeCompare(a.time || '');
                }),
            };

            const gistContent = {
                description: 'LifeLog Check-in Data',
                public: true,
                files: {
                    'lifelog-data.json': {
                        content: JSON.stringify(data, null, 2),
                    },
                },
            };

            let gistId = await this.getGistId();
            let response;

            if (gistId) {
                // Update existing Gist
                response = await fetch(`https://api.github.com/gists/${gistId}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(gistContent),
                });
            } else {
                // Create new Gist
                response = await fetch('https://api.github.com/gists', {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(gistContent),
                });
            }

            if (response.ok) {
                const gist = await response.json();
                await this.saveGistId(gist.id);
                return {
                    success: true,
                    gistId: gist.id,
                    url: gist.html_url,
                    rawUrl: gist.files['lifelog-data.json'].raw_url,
                };
            } else {
                const error = await response.json();
                return { success: false, error: error.message || 'Failed to sync' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async disconnect() {
        await AsyncStorage.removeItem(GIST_TOKEN_KEY);
        await AsyncStorage.removeItem(GIST_ID_KEY);
    }
}

export default new GistSyncService();
