import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  Dimensions,
  PanResponder,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';

import { storage } from './src/utils/storage';
import { useHealthKit } from './src/hooks/useHealthKit';
import { MOODS, METRICS, QUICK_METRICS, SLEEP_METRIC, EXERCISE_METRIC } from './src/utils/constants';
import { exportToCSV, importFromCSV } from './src/utils/export';
import { SheetsSync, APPS_SCRIPT_TEMPLATE } from './src/utils/sheetsSync';
import { ThemeProvider, useTheme } from './src/utils/ThemeContext';
import GistSync from './src/utils/gistSync';

// Re-export for backward compatibility - will be replaced with dynamic colors
let COLORS = {}; // This will be set dynamically

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { isDark, toggleTheme, colors: COLORS } = useTheme();
  const [view, setView] = useState('today');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCheckin, setShowCheckin] = useState(false);
  const [checkinMode, setCheckinMode] = useState('quick');
  const [editingEntry, setEditingEntry] = useState(null);
  const [userSettings, setUserSettings] = useState({ sleepGoal: 8, exerciseGoal: 30 });

  // Sync State
  const [isSheetsConnected, setIsSheetsConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // GitHub Gist Sync State
  const [gistToken, setGistToken] = useState('');
  const [isGistConnected, setIsGistConnected] = useState(false);
  const [gistUrl, setGistUrl] = useState('');

  const handleSheetsToggle = () => {
    if (isSheetsConnected) {
      Alert.alert('Disconnect Sheets', 'Stop syncing to Google Sheets?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await SheetsSync.saveUrl(null);
            setIsSheetsConnected(false);
            setSheetsUrl('');
          }
        }
      ]);
    } else {
      setShowSettings(true);
    }
  };

  const handleSaveSettings = async () => {
    if (!sheetsUrl.trim()) {
      Alert.alert('Error', 'Please enter a Google Apps Script URL');
      return;
    }

    setIsSyncing(true);
    await SheetsSync.saveUrl(sheetsUrl);
    await storage.saveUserSettings(userSettings);

    // Test connection
    const result = await SheetsSync.testConnection();
    setIsSyncing(false);

    if (result.success) {
      setIsSheetsConnected(true);
      setShowSettings(false);
      Alert.alert('Connected!', 'Google Sheets sync is now enabled. Your data will sync automatically.');

      // Initial sync
      const data = await storage.getEntries();
      SheetsSync.syncAll(data);
    } else {
      Alert.alert('Connection Failed', 'Could not connect to your Google Apps Script. Please check the URL and make sure the script is deployed correctly.\n\nError: ' + result.error);
    }
  };

  const handleSyncNow = async () => {
    if (!isSheetsConnected) return;
    setIsSyncing(true);
    const data = await storage.getEntries();
    const result = await SheetsSync.syncAll(data);
    setIsSyncing(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Synced!', 'All entries have been synced to Google Sheets.');
    } else {
      Alert.alert('Sync Failed', 'Error: ' + result.error);
    }
  };

  // Form state
  const [mood, setMood] = useState(null);
  const [metrics, setMetrics] = useState({
    stress: 50, energy: 50, clarity: 50, motivation: 50, fulfillment: 50
  });
  const [metricNotes, setMetricNotes] = useState({
    stress: '', energy: '', clarity: '', motivation: '', fulfillment: '', exercise: '', sleep: ''
  });
  const [note, setNote] = useState('');
  const [health, setHealth] = useState({ steps: '', sleep: '', heartRate: '', calories: '', exerciseMinutes: '' });
  const [entryDate, setEntryDate] = useState(new Date());
  // Reflection fields
  const [reflections, setReflections] = useState({
    wentWell: '',
    didNotGoWell: '',
    gratefulFor: ''
  });

  // HealthKit
  const healthKit = useHealthKit();

  useEffect(() => {
    loadData();
    if (Platform.OS === 'ios' && healthKit.isAvailable) {
      healthKit.requestAuthorization();
    }
  }, [healthKit.isAvailable]);

  const loadData = async () => {
    try {
      // Load everything in parallel
      const [data, settings, isConfigured, url, gistConfigured, savedGistUrl, savedGistToken] = await Promise.all([
        storage.getEntries(),
        storage.getUserSettings(),
        SheetsSync.isConfigured(),
        SheetsSync.getUrl(),
        GistSync.isConfigured(),
        GistSync.getGistUrl(),
        GistSync.getToken()
      ]);

      setEntries(data);
      setUserSettings(settings);
      setIsSheetsConnected(isConfigured);
      setSheetsUrl(url || '');
      setIsGistConnected(gistConfigured);
      setGistUrl(savedGistUrl || '');
      setGistToken(savedGistToken || '');
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleResetData = () => {
    Alert.alert(
      '⚠️ Reset All Data',
      'This will permanently delete ALL your log entries. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: () => {
            // Second confirmation for safety
            Alert.alert(
              'Are you absolutely sure?',
              'Type confirmation: All ' + entries.length + ' entries will be deleted forever.',
              [
                { text: 'No, Keep My Data', style: 'cancel' },
                {
                  text: 'Yes, Delete All',
                  style: 'destructive',
                  onPress: async () => {
                    await storage.clearAll();
                    setEntries([]);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('Done', 'All data has been reset.');
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const resetForm = () => {
    setMood(null);
    setMetrics({ stress: 50, energy: 50, clarity: 50, motivation: 50, fulfillment: 50 });
    setMetricNotes({ stress: '', energy: '', clarity: '', motivation: '', fulfillment: '', exercise: '', sleep: '' });
    setNote('');
    setHealth({ steps: '', sleep: '', heartRate: '', calories: '', exerciseMinutes: '' });
    setEditingEntry(null);
    setEntryDate(new Date());
    setReflections({ wentWell: '', didNotGoWell: '', gratefulFor: '' });
  };

  const openCheckin = async (mode = 'quick', entry = null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (entry) {
      setEditingEntry(entry);
      setMood(entry.mood);
      setMetrics({
        stress: entry.stress ?? 50,
        energy: entry.energy ?? 50,
        clarity: entry.clarity ?? 50,
        motivation: entry.motivation ?? 50,
        fulfillment: entry.fulfillment ?? 50,

      });
      setMetricNotes({
        stress: entry.metricNotes?.stress || '',
        energy: entry.metricNotes?.energy || '',
        clarity: entry.metricNotes?.clarity || '',
        motivation: entry.metricNotes?.motivation || '',
        fulfillment: entry.metricNotes?.fulfillment || '',
        exercise: entry.metricNotes?.exercise || '',
        sleep: entry.metricNotes?.sleep || '',
      });
      setNote(entry.note || '');
      setHealth({
        steps: entry.health?.steps?.toString() ?? '',
        sleep: entry.health?.sleep?.toString() ?? '',
        heartRate: entry.health?.heartRate?.toString() ?? '',
        calories: entry.health?.calories?.toString() ?? '',
        exerciseMinutes: entry.health?.exerciseMinutes?.toString() ?? '',
      });
      setReflections({
        wentWell: entry.reflections?.wentWell || '',
        didNotGoWell: entry.reflections?.didNotGoWell || '',
        gratefulFor: entry.reflections?.gratefulFor || '',
      });
      // Set entryDate from the editing entry's timestamp so user can edit it
      setEntryDate(new Date(entry.timestamp));
      // Default to the entry's original type (quick or full)
      setCheckinMode(entry.type || 'full');
    } else {
      resetForm();
      setCheckinMode(mode);

      // Auto-fill health data from HealthKit
      if (mode === 'full' && healthKit.isAuthorized) {
        const healthData = await healthKit.fetchAllHealthData();
        setHealth({
          steps: healthData.steps?.toString() ?? '',
          sleep: healthData.sleep?.toString() ?? '',
          heartRate: healthData.heartRate?.toString() ?? '',
          heartRate: healthData.heartRate?.toString() ?? '',
          calories: healthData.calories?.toString() ?? '',
          exerciseMinutes: '', // Initialize exercise minutes as empty since HealthKit doesn't provide it yet
        });
      }
    }
    setShowCheckin(true);
  };

  const save = async () => {
    if (!mood) return;

    // Use entryDate for both new and edited entries (user may have changed it)
    const dateToUse = entryDate;
    const entry = {
      id: editingEntry?.id || `${dateToUse.getTime()}`,
      timestamp: dateToUse.toISOString(),
      date: toLocalDateStr(dateToUse),
      time: dateToUse.toTimeString().slice(0, 5),
      type: checkinMode,
      mood,
      ...(checkinMode === 'full' ? metrics : { stress: metrics.stress, energy: metrics.energy, clarity: metrics.clarity }),
      metricNotes: Object.fromEntries(
        Object.entries(metricNotes).filter(([_, v]) => v && v.trim())
      ),
      note: note || null,
      health: checkinMode === 'full' ? {
        steps: health.steps ? parseInt(health.steps) : null,
        sleep: health.sleep ? parseFloat(health.sleep) : null,
        heartRate: health.heartRate ? parseInt(health.heartRate) : null,
        calories: health.calories ? parseInt(health.calories) : null,
        exerciseMinutes: health.exerciseMinutes ? parseInt(health.exerciseMinutes) : null,
      } : null,
      reflections: checkinMode === 'full' ? {
        wentWell: reflections.wentWell || null,
        didNotGoWell: reflections.didNotGoWell || null,
        gratefulFor: reflections.gratefulFor || null,
      } : null,
    };

    let updated;
    if (editingEntry) {
      updated = entries.map(e => e.id === editingEntry.id ? entry : e);
    } else {
      updated = [entry, ...entries];
    }
    updated.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    setEntries(updated);
    await storage.saveEntries(updated);

    // Auto-sync to Gist if connected
    if (isGistConnected) GistSync.syncAll(updated);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowCheckin(false);
    resetForm();
  };

  const deleteEntry = (id) => {
    Alert.alert('Delete Entry', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = entries.filter(e => e.id !== id);
          setEntries(updated);
          await storage.saveEntries(updated);
          // Auto-sync to Gist if connected
          if (isGistConnected) GistSync.syncAll(updated);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  // Derived data
  const todayEntries = useMemo(() => {
    const today = toLocalDateStr(new Date());
    return entries.filter(e => e.date === today).sort(
      (a, b) => (b.time || '').localeCompare(a.time || '')
    );
  }, [entries]);

  const groupedEntries = useMemo(() => {
    const groups = {};
    entries.forEach(e => {
      if (!groups[e.date]) groups[e.date] = [];
      groups[e.date].push(e);
    });
    // Sort each day's entries by time (latest first)
    Object.values(groups).forEach(dayEntries => {
      dayEntries.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Dynamic styles based on theme
  const dynamicStyles = {
    container: { flex: 1, backgroundColor: COLORS.background },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
    loadingText: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '500' },
    title: { fontSize: 34, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
    tabBarInner: { flexDirection: 'row', backgroundColor: COLORS.tabBarBg, borderRadius: 16, padding: 4 },
    tabActive: { backgroundColor: COLORS.card, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3 },
    tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
    tabTextActive: { color: COLORS.text, fontWeight: '700' },
    card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.02)' },
    modalContainer: { flex: 1, backgroundColor: COLORS.modalBg },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={dynamicStyles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={dynamicStyles.title}>LifeLog</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity onPress={toggleTheme} style={styles.exportBtn}>
              <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.exportBtn}>
              <Text style={{ fontSize: 16 }}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <View style={dynamicStyles.tabBarInner}>
            {[['today', 'Today'], ['history', 'History'], ['insights', 'Insights']].map(([key, label]) => (
              <TouchableOpacity
                key={key}
                onPress={() => setView(key)}
                style={[styles.tab, view === key && dynamicStyles.tabActive]}
              >
                <Text style={[dynamicStyles.tabText, view === key && dynamicStyles.tabTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {view === 'today' && (
            <TodayView
              entries={todayEntries}
              onEdit={(entry) => openCheckin('full', entry)}
              onDelete={deleteEntry}
              colors={COLORS}
            />
          )}
          {view === 'history' && (
            <HistoryView
              groupedEntries={groupedEntries}
              onEdit={(entry) => openCheckin('full', entry)}
              onDelete={deleteEntry}
              colors={COLORS}
            />
          )}
          {view === 'insights' && (
            <InsightsView
              entries={entries}
              colors={COLORS}
              sleepGoal={userSettings.sleepGoal}
              exerciseGoal={userSettings.exerciseGoal}
            />
          )}
        </ScrollView>

        {/* FAB */}
        <View style={styles.fabContainer}>
          <TouchableOpacity style={styles.fabSecondary} onPress={() => openCheckin('full')}>
            <Text style={styles.fabSecondaryText}>Full Log</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fab} onPress={() => openCheckin('quick')}>
            <Text style={[styles.fabText, { color: COLORS.text }]}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Check-In Modal */}
        <CheckInModal
          visible={showCheckin}
          onClose={() => { setShowCheckin(false); resetForm(); }}
          onSave={save}
          onDelete={(id) => { setShowCheckin(false); resetForm(); deleteEntry(id); }}
          mode={checkinMode}
          setMode={setCheckinMode}
          mood={mood}
          setMood={setMood}
          metrics={metrics}
          setMetrics={setMetrics}
          metricNotes={metricNotes}
          setMetricNotes={setMetricNotes}
          note={note}
          setNote={setNote}
          health={health}
          setHealth={setHealth}
          editingEntry={editingEntry}
          entryDate={entryDate}
          setEntryDate={setEntryDate}
          reflections={reflections}
          setReflections={setReflections}
        />

        {/* Settings Modal */}
        <Modal visible={showSettings} animationType="slide">
          <SafeAreaView style={dynamicStyles.modalContainer}>
            <View style={dynamicStyles.modalHeader}>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 17, fontWeight: '600', color: COLORS.text }}>Settings</Text>
              <TouchableOpacity onPress={async () => {
                await storage.saveUserSettings(userSettings);
                setShowSettings(false);
                Alert.alert('Saved!', 'Your settings have been saved.');
              }}>
                <Text style={styles.modalSave}>Save</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              <View style={{ marginTop: 24 }}>
                <Text style={[styles.sectionLabel, { color: COLORS.textSecondary }]}>Daily Goals</Text>
                <View style={dynamicStyles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text }}>😴 Sleep Goal (hrs)</Text>
                    <TextInput
                      style={{ backgroundColor: COLORS.background, borderRadius: 8, padding: 8, width: 80, textAlign: 'center', color: COLORS.text, fontSize: 16, fontWeight: '700' }}
                      value={String(userSettings.sleepGoal)}
                      onChangeText={(t) => setUserSettings(prev => ({ ...prev, sleepGoal: parseFloat(t) || 0 }))}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text }}>👟 Exercise Goal (min)</Text>
                    <TextInput
                      style={{ backgroundColor: COLORS.background, borderRadius: 8, padding: 8, width: 80, textAlign: 'center', color: COLORS.text, fontSize: 16, fontWeight: '700' }}
                      value={String(userSettings.exerciseGoal)}
                      onChangeText={(t) => setUserSettings(prev => ({ ...prev, exerciseGoal: parseFloat(t) || 0 }))}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              {/* GitHub Gist Sync Section */}
              <View style={{ marginTop: 32, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 24 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8 }}>📊 GitHub Gist Sync</Text>
                <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 16 }}>
                  Simpler alternative! Sync to GitHub Gist and share a public link with anyone.
                </Text>

                <Text style={[styles.sectionLabel, { color: COLORS.textSecondary }]}>Setup Instructions</Text>
                <View style={dynamicStyles.card}>
                  <Text style={{ fontSize: 14, lineHeight: 22, color: COLORS.text }}>
                    1. Go to github.com → Settings → Developer Settings{'\n'}
                    2. Personal Access Tokens → Tokens (classic){'\n'}
                    3. Generate new token (classic){'\n'}
                    4. Check "gist" permission only{'\n'}
                    5. Copy the token and paste below
                  </Text>
                </View>

                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.sectionLabel, { color: COLORS.textSecondary }]}>GitHub Token</Text>
                  <TextInput
                    style={[styles.noteInput, { height: 50, backgroundColor: COLORS.card, color: COLORS.text }]}
                    value={gistToken}
                    onChangeText={setGistToken}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    placeholderTextColor={COLORS.textTertiary}
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect={false}
                    secureTextEntry
                  />
                </View>

                <TouchableOpacity
                  style={{ marginTop: 16, backgroundColor: isGistConnected ? COLORS.green : COLORS.blue, paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                  onPress={async () => {
                    if (!gistToken.trim()) {
                      Alert.alert('Error', 'Please enter a GitHub token');
                      return;
                    }
                    setIsSyncing(true);
                    await GistSync.saveToken(gistToken);
                    const result = await GistSync.testConnection();
                    if (result.success) {
                      // Sync all data
                      const syncResult = await GistSync.syncAll(entries);
                      setIsSyncing(false);
                      if (syncResult.success) {
                        setIsGistConnected(true);
                        setGistUrl(syncResult.url);
                        Alert.alert(
                          '✅ Connected!',
                          `Your data is syncing to:\n${syncResult.url}\n\nShare this link with anyone!`,
                          [{ text: 'OK' }]
                        );
                      } else {
                        Alert.alert('Sync Failed', syncResult.error);
                      }
                    } else {
                      setIsSyncing(false);
                      Alert.alert('Connection Failed', result.error);
                    }
                  }}
                  disabled={isSyncing}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                    {isSyncing ? '⏳ Syncing...' : isGistConnected ? '✅ Sync Now' : '🔗 Connect & Sync'}
                  </Text>
                </TouchableOpacity>

                {isGistConnected && gistUrl && (
                  <View style={{ marginTop: 16 }}>
                    <View style={{ padding: 16, backgroundColor: 'rgba(0,200,100,0.1)', borderRadius: 12, marginBottom: 12 }}>
                      <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>📎 Share this link:</Text>
                      <Text style={{ fontSize: 13, color: COLORS.blue }} selectable>{gistUrl}</Text>
                    </View>

                    <TouchableOpacity
                      style={{ backgroundColor: COLORS.card, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.blue }}
                      onPress={() => Linking.openURL('https://justinberken.github.io/LifeLog/lifelog-viewer/index.html')}
                    >
                      <Text style={{ color: COLORS.blue, fontWeight: '700', fontSize: 16 }}>📊 View Dashboard</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Data Management Section */}
              <View style={{ marginTop: 32, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 24 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 }}>📁 Data Management</Text>

                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 16, borderRadius: 12, marginBottom: 12 }}
                  onPress={exportToCSV}
                >
                  <Text style={{ fontSize: 24, marginRight: 12 }}>📤</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text }}>Export Data</Text>
                    <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Download your entries as CSV</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 16, borderRadius: 12, marginBottom: 12 }}
                  onPress={() => importFromCSV((merged) => setEntries(merged))}
                >
                  <Text style={{ fontSize: 24, marginRight: 12 }}>📥</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text }}>Import Data</Text>
                    <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Load entries from a CSV file</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,59,48,0.1)', padding: 16, borderRadius: 12 }}
                  onPress={handleResetData}
                >
                  <Text style={{ fontSize: 24, marginRight: 12 }}>🗑️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.red }}>Delete All Data</Text>
                    <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Permanently remove all entries</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={{ height: 100 }} />
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView >
    </SafeAreaProvider >
  );
}

// ============================================================
// TODAY VIEW
// ============================================================
function TodayView({ entries, onEdit, onDelete, colors: COLORS }) {
  if (entries.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>🌤</Text>
        <Text style={[styles.emptyText, { color: COLORS.text }]}>No check-ins yet today</Text>
        <Text style={[styles.emptySubtext, { color: COLORS.textSecondary }]}>Tap + to log how you're feeling</Text>
      </View>
    );
  }

  // Today summary
  const avgMood = entries.reduce((s, e) => s + (e.mood || 0), 0) / entries.length;
  const avgEnergy = entries.filter(e => e.energy).reduce((s, e) => s + e.energy, 0) / (entries.filter(e => e.energy).length || 1);
  const avgStress = entries.filter(e => e.stress).reduce((s, e) => s + e.stress, 0) / (entries.filter(e => e.stress).length || 1);
  const avgClarity = entries.filter(e => e.clarity).reduce((s, e) => s + e.clarity, 0) / (entries.filter(e => e.clarity).length || 1);

  const cardStyle = { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.02)' };

  return (
    <View style={styles.todayContainer}>
      {/* Summary Card */}
      <View style={styles.card}>
        <View style={styles.summaryHeader}>
          <Text style={styles.label}>Today's Snapshot</Text>
          <Text style={styles.labelSecondary}>{entries.length} check-in{entries.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryEmoji}>{MOODS[Math.round(avgMood) - 1]?.emoji || '😐'}</Text>
            <Text style={styles.summaryLabel}>Mood</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: COLORS.orange }]}>{avgEnergy.toFixed(1)}</Text>
            <Text style={styles.summaryLabel}>Energy</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: COLORS.teal }]}>{avgClarity.toFixed(1)}</Text>
            <Text style={styles.summaryLabel}>Clarity</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: COLORS.red }]}>{avgStress.toFixed(1)}</Text>
            <Text style={styles.summaryLabel}>Stress</Text>
          </View>
        </View>
      </View>

      {/* Timeline */}
      <View style={styles.timeline}>
        {entries.map((entry, i) => {
          const m = MOODS.find(x => x.value === entry.mood) || MOODS[2];
          return (
            <View key={entry.id} style={styles.timelineItem}>
              <View style={[styles.timelineNode, { backgroundColor: m.color + '20' }]}>
                <Text style={styles.timelineEmoji}>{m.emoji}</Text>
              </View>
              {i < entries.length - 1 && <View style={styles.timelineLine} />}
              <View style={styles.timelineCard}>
                <View style={styles.timelineHeader}>
                  <View>
                    <Text style={styles.timelineTime}>{formatTime(entry.time)}</Text>
                    <Text style={styles.timelineMoodLabel}>{m.label} {entry.type === 'quick' && '· Quick'}</Text>
                  </View>
                  <View style={styles.timelineActions}>
                    <TouchableOpacity onPress={() => onEdit(entry)} style={styles.actionBtn}>
                      <Text style={styles.actionIcon}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onDelete(entry.id)} style={styles.actionBtn}>
                      <Text style={styles.actionIcon}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.pillRow}>
                  {METRICS.filter(mt => entry[mt.key] != null).map(mt => (
                    <View key={mt.key} style={[styles.pill, { backgroundColor: mt.color + '15' }]}>
                      <Text style={[styles.pillText, { color: mt.color }]}>{mt.icon} {entry[mt.key]}</Text>
                    </View>
                  ))}
                </View>
                {entry.note && <Text style={styles.timelineNote}>{entry.note}</Text>}
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ height: 120 }} />
    </View>
  );
}

// ============================================================
// HISTORY VIEW
// ============================================================
function HistoryView({ groupedEntries, onEdit, onDelete, colors: COLORS }) {
  const cardStyle = { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.02)' };
  const [expanded, setExpanded] = useState({});

  if (groupedEntries.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>📝</Text>
        <Text style={[styles.emptyText, { color: COLORS.text }]}>No entries yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.historyContainer}>
      {groupedEntries.map(([date, dayEntries]) => {
        const isExpanded = expanded[date] !== false;
        const avgMood = dayEntries.reduce((s, e) => s + (e.mood || 0), 0) / dayEntries.length;
        const emoji = MOODS[Math.round(avgMood) - 1]?.emoji || '😐';

        return (
          <View key={date} style={cardStyle}>
            <TouchableOpacity
              style={styles.dayHeader}
              onPress={() => setExpanded({ ...expanded, [date]: !isExpanded })}
            >
              <View style={styles.dayHeaderLeft}>
                <Text style={styles.dayEmoji}>{emoji}</Text>
                <View>
                  <Text style={[styles.dayTitle, { color: COLORS.text }]}>{formatDate(date)}</Text>
                  <Text style={[styles.daySubtitle, { color: COLORS.textSecondary }]}>{dayEntries.length} check-in{dayEntries.length !== 1 ? 's' : ''}</Text>
                </View>
              </View>
              <Text style={[styles.chevron, { color: COLORS.textTertiary }]}>{isExpanded ? '▼' : '▶'}</Text>
            </TouchableOpacity>

            {isExpanded && (
              <View style={styles.dayEntries}>
                {dayEntries.map(entry => {
                  const m = MOODS.find(x => x.value === entry.mood) || MOODS[2];
                  // Full entries get a distinct gray background
                  const entryBg = entry.type === 'full'
                    ? (COLORS.background === '#F2F2F7' ? '#D1D1D6' : '#3A3A3C')
                    : COLORS.background;

                  // Indent quick entries
                  const entryMarginLeft = entry.type === 'quick' ? 25 : 0;

                  return (
                    <TouchableOpacity key={entry.id} style={[styles.dayEntry, { backgroundColor: entryBg, marginLeft: entryMarginLeft }]} onPress={() => onEdit(entry)}>
                      <Text style={styles.dayEntryEmoji}>{m.emoji}</Text>
                      <View style={styles.dayEntryContent}>
                        <Text style={[styles.dayEntryTime, { color: COLORS.text }]}>{formatTime(entry.time)}</Text>
                        {entry.note && <Text style={[styles.dayEntryNote, { color: COLORS.textSecondary }]} numberOfLines={1}>{entry.note}</Text>}
                      </View>
                      {entry.type === 'full' && (
                        <Text style={[styles.entryTypeBadge, { color: COLORS.textSecondary }]}>Full Log</Text>
                      )}
                      <Text>✏️</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      <View style={{ height: 120 }} />
    </View>
  );
}

// ============================================================
// INSIGHTS VIEW
// ============================================================
const TIME_PERIODS = [
  { key: 'day', label: 'Day', days: 1 },
  { key: 'week', label: 'Week', days: 7 },
  { key: 'month', label: 'Month', days: 30 },
  { key: 'year', label: 'Year', days: 365 },
];

function TimePeriodSelector({ selected, onSelect, colors: COLORS }) {
  return (
    <View style={[styles.periodSelector, { backgroundColor: COLORS.sliderTrack }]}>
      {TIME_PERIODS.map(p => (
        <TouchableOpacity
          key={p.key}
          style={[styles.periodBtn, selected === p.key && [styles.periodBtnActive, { backgroundColor: COLORS.card }]]}
          onPress={() => onSelect(p.key)}
        >
          <Text style={[styles.periodBtnText, { color: COLORS.textSecondary }, selected === p.key && { color: COLORS.text }]}>
            {p.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function InsightsView({ entries, colors: COLORS, sleepGoal, exerciseGoal }) {
  const userSettings = { sleepGoal, exerciseGoal }; // Wrap for convenience
  const cardStyle = { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.02)' };
  const [avgPeriod, setAvgPeriod] = useState('week');
  const [trendPeriod, setTrendPeriod] = useState('week');

  if (entries.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>📊</Text>
        <Text style={[styles.emptyText, { color: COLORS.text }]}>No entries yet</Text>
        <Text style={[styles.emptySubtext, { color: COLORS.textSecondary }]}>Log a check-in to see insights</Text>
      </View>
    );
  }

  // Filter entries by selected period
  const getFilteredEntries = (periodKey) => {
    const period = TIME_PERIODS.find(p => p.key === periodKey);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - period.days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    return entries.filter(e => e.date >= cutoffStr);
  };

  const avgEntries = getFilteredEntries(avgPeriod);

  const avg = (key) => {
    const valid = avgEntries.filter(e => e[key] != null);
    return valid.length ? valid.reduce((s, e) => s + e[key], 0) / valid.length : null;
  };

  // Time of day analysis (using all entries)
  const byTimeOfDay = { morning: [], afternoon: [], evening: [], night: [] };
  entries.forEach(e => {
    if (!e.time) return;
    const hour = parseInt(e.time.split(':')[0]);
    const tod = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
    byTimeOfDay[tod].push(e);
  });

  const todAvg = (tod, key) => {
    const arr = byTimeOfDay[tod].filter(e => e[key] != null);
    return arr.length >= 2 ? arr.reduce((s, e) => s + e[key], 0) / arr.length : null;
  };

  return (
    <View style={styles.insightsContainer}>
      {/* Averages */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.label, { color: COLORS.textSecondary }]}>Averages</Text>
          <TimePeriodSelector selected={avgPeriod} onSelect={setAvgPeriod} colors={COLORS} />
        </View>
        {avgEntries.length === 0 ? (
          <Text style={[styles.todNoData, { color: COLORS.textTertiary }]}>No data for this period</Text>
        ) : (
          <View style={styles.avgGrid}>
            <View style={[styles.avgCard, { backgroundColor: COLORS.background }]}>
              <Text style={styles.avgEmoji}>{MOODS[Math.round(avg('mood') || 3) - 1]?.emoji}</Text>
              <Text style={[styles.avgLabel, { color: COLORS.textSecondary }]}>Mood</Text>
            </View>
            {METRICS.map(m => (
              <View key={m.key} style={[styles.avgCard, { backgroundColor: COLORS.background }]}>
                <Text style={[styles.avgValue, { color: m.color }]}>{avg(m.key)?.toFixed(0) || '—'}%</Text>
                <Text style={[styles.avgLabel, { color: COLORS.textSecondary }]}>{m.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Unified Trend Chart */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.label, { color: COLORS.textSecondary }]}>Trends</Text>
          <TimePeriodSelector selected={trendPeriod} onSelect={setTrendPeriod} colors={COLORS} />
        </View>
        <UnifiedTrendChart
          entries={entries}
          period={trendPeriod}
          sleepGoal={sleepGoal}
          exerciseGoal={exerciseGoal}
          colors={COLORS}
        />
      </View>

      {/* Time of Day */}
      <View style={styles.card}>
        <Text style={[styles.label, { color: COLORS.textSecondary }]}>Time of Day Patterns</Text>
        <View style={styles.todGrid}>
          {[
            { key: 'morning', icon: '🌅', label: 'Morning' },
            { key: 'afternoon', icon: '☀️', label: 'Afternoon' },
            { key: 'evening', icon: '🌆', label: 'Evening' },
            { key: 'night', icon: '🌙', label: 'Night' },
          ].map(tod => (
            <View key={tod.key} style={[styles.todCard, { backgroundColor: COLORS.background }]}>
              <Text style={[styles.todLabel, { color: COLORS.text }]}>{tod.icon} {tod.label}</Text>
              {byTimeOfDay[tod.key].length >= 2 ? (
                <View style={styles.todStats}>
                  <Text style={styles.todStat}>
                    <Text style={[styles.todStatLabel, { color: COLORS.textSecondary }]}>Mood </Text>
                    <Text style={[styles.todStatValue, { color: COLORS.green }]}>{todAvg(tod.key, 'mood')?.toFixed(1) || '—'}</Text>
                  </Text>
                  <Text style={styles.todStat}>
                    <Text style={[styles.todStatLabel, { color: COLORS.textSecondary }]}>Energy </Text>
                    <Text style={[styles.todStatValue, { color: COLORS.orange }]}>{todAvg(tod.key, 'energy')?.toFixed(0) || '—'}%</Text>
                  </Text>
                </View>
              ) : (
                <Text style={[styles.todNoData, { color: COLORS.textTertiary }]}>Not enough data</Text>
              )}
            </View>
          ))}
        </View>
      </View>

      <View style={{ height: 120 }} />
    </View>
  );
}

// Unified Trend Chart showing all metrics
function UnifiedTrendChart({ entries, period, sleepGoal, exerciseGoal, colors: COLORS }) {
  const width = SCREEN_WIDTH - 72;
  const height = 160;
  const padding = 16;

  const periodConfig = TIME_PERIODS.find(p => p.key === period);
  const numDays = periodConfig.days;

  // Get data points based on period
  const days = [];

  if (period === 'day') {
    // Hourly data for today
    const today = toLocalDateStr(new Date());
    for (let i = 0; i < 24; i++) {
      const hourStr = i.toString().padStart(2, '0');
      const hourEntries = entries.filter(e => e.date === today && e.time && e.time.startsWith(hourStr));

      const getAvg = (key) => {
        const valid = hourEntries.filter(e => e[key] != null);
        return valid.length ? valid.reduce((s, e) => s + e[key], 0) / valid.length : null;
      };

      const getSleepAvg = () => {
        const valid = hourEntries.filter(e => e.health && e.health.sleep);
        return valid.length ? valid.reduce((s, e) => s + parseFloat(e.health.sleep), 0) / valid.length : null;
      };

      const getExerciseAvg = () => {
        const valid = hourEntries.filter(e => e.health && e.health.exerciseMinutes);
        return valid.length ? valid.reduce((s, e) => s + parseInt(e.health.exerciseMinutes), 0) / valid.length : null;
      };

      days.push({
        label: i,
        values: {
          mood: getAvg('mood'),
          sleep: getSleepAvg(),
          exercise: getExerciseAvg(),
          ...METRICS.reduce((acc, m) => ({ ...acc, [m.key]: getAvg(m.key) }), {})
        }
      });
    }
  } else {
    // Daily data for week/month/year
    const isYear = period === 'year';
    const loops = isYear ? 12 : numDays;

    for (let i = loops - 1; i >= 0; i--) {
      let dateLabel = '';
      let dateEntries = [];

      if (isYear) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        // Simplified month filter
        const monthStr = d.toISOString().substring(0, 7); // YYYY-MM
        dateEntries = entries.filter(e => e.date.startsWith(monthStr));
        dateLabel = d.toLocaleDateString('en', { month: 'short' });
      } else {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = toLocalDateStr(d);
        dateEntries = entries.filter(e => e.date === dateStr);
        dateLabel = d.getDate();
      }

      const getAvg = (key) => {
        const valid = dateEntries.filter(e => e[key] != null);
        return valid.length ? valid.reduce((s, e) => s + e[key], 0) / valid.length : null;
      };

      const getSleepAvg = () => {
        const valid = dateEntries.filter(e => e.health && e.health.sleep);
        return valid.length ? valid.reduce((s, e) => s + parseFloat(e.health.sleep), 0) / valid.length : null;
      };

      const getExerciseAvg = () => {
        const valid = dateEntries.filter(e => e.health && e.health.exerciseMinutes);
        return valid.length ? valid.reduce((s, e) => s + parseInt(e.health.exerciseMinutes), 0) / valid.length : null;
      };

      days.push({
        label: dateLabel,
        values: {
          mood: getAvg('mood'),
          sleep: getSleepAvg(),
          exercise: getExerciseAvg(),
          ...METRICS.reduce((acc, m) => ({ ...acc, [m.key]: getAvg(m.key) }), {})
        }
      });
    }
  }

  // Check if we have any data
  const hasData = days.some(d => Object.values(d.values).some(v => v != null));
  if (!hasData) {
    return (
      <View style={[styles.chartContainer, { height: 160, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.chartNoData, { color: COLORS.textSecondary }]}>No data for this period</Text>
      </View>
    );
  }

  // All metrics to display
  const allMetrics = [
    { key: 'mood', color: COLORS.green, min: 1, max: 5 },
    { key: 'sleep', label: 'Sleep', color: SLEEP_METRIC.color, min: 0, max: sleepGoal || 8, cap: true },
    { key: 'exercise', label: 'Exercise', color: EXERCISE_METRIC.color, min: 0, max: exerciseGoal || 30, cap: true },
    ...METRICS.map(m => ({ key: m.key, label: m.label, color: m.color, min: 0, max: 100 })),
  ];

  // Generate paths
  const metricPaths = allMetrics.map(metric => {
    const pts = days.map((d, i) => {
      const value = d.values[metric.key];
      if (value == null) return null;

      // Normalize to 0-100 scale
      let normalized = ((value - metric.min) / (metric.max - metric.min)) * 100;
      if (metric.cap) normalized = Math.min(normalized, 100);

      return {
        x: padding + (i / (days.length - 1)) * (width - 2 * padding),
        y: height - padding - (normalized / 100) * (height - 2 * padding),
      };
    }).filter(p => p != null);

    if (pts.length < 2) return null;
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Only show dots if it's not hourly (too crowded) or if it's sparse
    const showDots = period !== 'day';
    return { ...metric, path, pts, showDots };
  }).filter(p => p != null);

  const getLabel = (pos) => {
    if (days.length === 0) return '';
    const idx = pos === 'start' ? 0 : days.length - 1;
    return period === 'day' ? `${days[idx].label}:00` : days[idx].label;
  };

  return (
    <View style={styles.chartContainer}>
      <Svg width={width} height={height}>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(val => {
          const y = height - padding - (val / 100) * (height - 2 * padding);
          return <Line key={val} x1={padding} y1={y} x2={width - padding} y2={y} stroke={COLORS.border} strokeWidth={1} />;
        })}

        {metricPaths.map((metric) => (
          <React.Fragment key={metric.key}>
            <Path
              d={metric.path}
              fill="none"
              stroke={metric.color}
              strokeWidth={2}
              strokeOpacity={0.8}
            />
            {metric.showDots && metric.pts.map((p, i) => (
              <Circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={2.5}
                fill="white"
                stroke={metric.color}
                strokeWidth={1.5}
              />
            ))}
          </React.Fragment>
        ))}
      </Svg>
      <View style={styles.chartLabels}>
        <Text style={[styles.chartLabel, { color: COLORS.textTertiary }]}>{getLabel('start')}</Text>
        <Text style={[styles.chartLabel, { color: COLORS.textTertiary }]}>{period === 'day' ? 'Today' : period === 'year' ? 'Year' : 'Now'}</Text>
        <Text style={[styles.chartLabel, { color: COLORS.textTertiary }]}>{getLabel('end')}</Text>
      </View>

      {/* Legend */}
      <View style={styles.trendLegend}>
        {allMetrics.map(m => {
          // Skip if no path
          if (!metricPaths.find(p => p.key === m.key)) return null;
          return (
            <View key={m.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: m.color }]} />
              <Text style={[styles.legendTextSmall, { color: COLORS.textSecondary }]}>{m.key === 'mood' ? 'Mood' : m.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ============================================================
// CHECK-IN MODAL
// ============================================================
function CheckInModal({
  visible, onClose, onSave, onDelete, mode, setMode,
  mood, setMood, metrics, setMetrics,
  metricNotes, setMetricNotes,
  note, setNote, health, setHealth, editingEntry,
  entryDate, setEntryDate, reflections, setReflections
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setEntryDate(selectedDate);
    }
  };

  const formatDateDisplay = () => {
    const now = new Date();
    const isToday = entryDate.toDateString() === now.toDateString();
    const timeDiff = Math.abs(now - entryDate);
    const isRecent = timeDiff < 60000; // within 1 minute

    if (isToday && isRecent) {
      return 'Right now';
    }
    // Use local date string comparison to ensure correct labeling
    const hours = entryDate.getHours();
    const minutes = entryDate.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${formatDate(toLocalDateStr(entryDate))} at ${hour12}:${minutes} ${ampm}`;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>

            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'quick' && styles.modeBtnActive]}
                onPress={() => setMode('quick')}
              >
                <Text style={[styles.modeBtnText, mode === 'quick' && styles.modeBtnTextActive]}>Quick</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'full' && styles.modeBtnActive]}
                onPress={() => setMode('full')}
              >
                <Text style={[styles.modeBtnText, mode === 'full' && styles.modeBtnTextActive]}>Full</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={onSave} disabled={!mood}>
              <Text style={[styles.modalSave, !mood && styles.modalSaveDisabled]}>
                {editingEntry ? 'Update' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Timestamp - Tappable for editing date/time (new or existing entries) */}
            <TouchableOpacity onPress={() => setShowDatePicker(true)}>
              <Text style={[styles.timestamp, styles.timestampTappable]}>
                📅 {formatDateDisplay()}
              </Text>
            </TouchableOpacity>

            {showDatePicker && (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={entryDate}
                  mode="datetime"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  maximumDate={new Date()}
                  style={styles.datePicker}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity
                    style={styles.datePickerDone}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.datePickerDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Mood */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>How are you feeling?</Text>
              <View style={styles.moodRow}>
                {MOODS.map(m => (
                  <TouchableOpacity
                    key={m.value}
                    style={[styles.moodBtn, mood === m.value && { backgroundColor: m.color + '20' }]}
                    onPress={() => {
                      setMood(m.value);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    <Text style={[styles.moodLabel, mood === m.value && { color: m.color, fontWeight: '600' }]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Metrics */}
            <View style={styles.section}>
              {(mode === 'quick' ? METRICS.filter(m => QUICK_METRICS.includes(m.key)) : METRICS).map(m => (
                <View key={m.key} style={styles.metricRow}>
                  <View style={styles.metricHeader}>
                    <Text style={styles.metricLabel}>{m.icon} {m.label}</Text>
                    <Text style={[styles.metricValue, { color: m.color }]}>{metrics[m.key]}%</Text>
                  </View>
                  <Slider
                    value={metrics[m.key]}
                    onValueChange={(v) => setMetrics({ ...metrics, [m.key]: v })}
                    color={m.color}
                  />
                  <View style={styles.metricLabels}>
                    <Text style={styles.metricLabelSmall}>{m.low}</Text>
                    <Text style={styles.metricLabelSmall}>{m.high}</Text>
                  </View>
                  <TextInput
                    style={styles.metricNoteInput}
                    value={metricNotes[m.key]}
                    onChangeText={(text) => setMetricNotes({ ...metricNotes, [m.key]: text })}
                    placeholder="Add a note... (optional)"
                    placeholderTextColor={COLORS.textTertiary}
                  />
                </View>
              ))}
            </View>

            {/* Note */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Note (optional)</Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder={mode === 'quick' ? "Quick thought..." : "What's on your mind?"}
                placeholderTextColor={COLORS.textTertiary}
                multiline
              />
            </View>

            {/* Health - Full mode */}
            {mode === 'full' && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Health Data</Text>
                <View style={styles.healthGrid}>
                  {[
                    { k: 'steps', l: 'Steps', i: '👟' },
                    { k: 'sleep', l: 'Sleep (hrs)', i: '😴', noteKey: 'sleep' },
                    { k: 'heartRate', l: 'Heart Rate', i: '❤️' },
                    { k: 'calories', l: 'Calories', i: '🔥' },
                    { k: 'exerciseMinutes', l: 'Exercise (min)', i: '🏃', noteKey: 'exercise' },
                  ].map(f => (
                    <View key={f.k} style={styles.healthCard}>
                      <Text style={styles.healthLabel}>{f.i} {f.l}</Text>
                      <TextInput
                        style={styles.healthInput}
                        value={health[f.k]}
                        onChangeText={(v) => setHealth({ ...health, [f.k]: v })}
                        keyboardType="numeric"
                        placeholderTextColor={COLORS.textTertiary}
                      />
                      {f.noteKey && (
                        <TextInput
                          style={styles.metricNoteInput}
                          value={metricNotes[f.noteKey]}
                          onChangeText={(text) => setMetricNotes({ ...metricNotes, [f.noteKey]: text })}
                          placeholder="Add a note... (optional)"
                          placeholderTextColor={COLORS.textTertiary}
                        />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Daily Reflections - Full mode */}
            {mode === 'full' && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Daily Reflections</Text>

                <View style={styles.reflectionCard}>
                  <Text style={styles.reflectionLabel}>✨ What went well today?</Text>
                  <TextInput
                    style={styles.reflectionInput}
                    value={reflections.wentWell}
                    onChangeText={(text) => setReflections({ ...reflections, wentWell: text })}
                    placeholder="Celebrate your wins, big or small..."
                    placeholderTextColor={COLORS.textTertiary}
                    multiline
                  />
                </View>

                <View style={styles.reflectionCard}>
                  <Text style={styles.reflectionLabel}>🌱 What did not go well today?</Text>
                  <TextInput
                    style={styles.reflectionInput}
                    value={reflections.didNotGoWell}
                    onChangeText={(text) => setReflections({ ...reflections, didNotGoWell: text })}
                    placeholder="What could be improved..."
                    placeholderTextColor={COLORS.textTertiary}
                    multiline
                  />
                </View>

                <View style={styles.reflectionCard}>
                  <Text style={styles.reflectionLabel}>🙏 What are you grateful for today?</Text>
                  <TextInput
                    style={styles.reflectionInput}
                    value={reflections.gratefulFor}
                    onChangeText={(text) => setReflections({ ...reflections, gratefulFor: text })}
                    placeholder="Express your gratitude..."
                    placeholderTextColor={COLORS.textTertiary}
                    multiline
                  />
                </View>
              </View>
            )}

            {/* Delete button - only when editing */}
            {editingEntry && (
              <TouchableOpacity
                style={{ backgroundColor: '#FF3B30', borderRadius: 12, padding: 16, marginTop: 24, alignItems: 'center' }}
                onPress={() => onDelete(editingEntry.id)}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>🗑️ Delete Entry</Text>
              </TouchableOpacity>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================================
// CUSTOM SLIDER (Percentage 0-100)
// ============================================================
function Slider({ value, onValueChange, color }) {
  const [displayValue, setDisplayValue] = useState(value);
  const sliderWidth = SCREEN_WIDTH - 72 - 32;

  // Use refs to store latest callback and avoid stale closures in PanResponder
  const onValueChangeRef = useRef(onValueChange);
  const sliderWidthRef = useRef(sliderWidth);
  // Store the starting pageX and current value when gesture begins
  const startPageXRef = useRef(0);
  const startValueRef = useRef(0);

  // Keep refs up to date
  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  useEffect(() => {
    sliderWidthRef.current = sliderWidth;
  }, [sliderWidth]);

  // Sync display value when prop changes
  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const calculateValueFromPageX = (pageX) => {
    const width = sliderWidthRef.current;
    // Calculate the delta from the start position
    const deltaX = pageX - startPageXRef.current;
    // Convert the starting value to pixels and add delta
    const startPixels = (startValueRef.current / 100) * width;
    const newPixels = startPixels + deltaX;
    // Clamp to valid range and convert back to percentage
    const clampedPixels = Math.max(0, Math.min(width, newPixels));
    return Math.round((clampedPixels / width) * 100);
  };

  const panResponder = useRef(
    PanResponder.create({
      // Capture phase - claim gesture before other responders
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      // Standard responder methods
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Prevent other views (like ScrollView) from stealing the gesture
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        // Store the starting position and current value
        startPageXRef.current = evt.nativeEvent.pageX;
        startValueRef.current = displayValue;
        // Also handle tap-to-set using locationX
        const locationX = evt.nativeEvent.locationX;
        const width = sliderWidthRef.current;
        const clampedX = Math.max(0, Math.min(width, locationX));
        const newValue = Math.round((clampedX / width) * 100);
        setDisplayValue(newValue);
        startValueRef.current = newValue; // Update start value to the tapped position
        onValueChangeRef.current(newValue);
      },
      onPanResponderMove: (evt) => {
        const newValue = calculateValueFromPageX(evt.nativeEvent.pageX);
        setDisplayValue(newValue);
        onValueChangeRef.current(newValue);
      },
      onPanResponderRelease: () => {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (e) {
          // Ignore haptics error on web
        }
      },
    })
  ).current;

  const fillPercent = displayValue;

  return (
    <View style={styles.sliderContainer}>
      <View
        style={styles.sliderTouchArea}
        {...panResponder.panHandlers}
      >
        <View style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: `${fillPercent}%`, backgroundColor: color }]} />
        </View>
        <View style={[styles.sliderThumb, { left: `${fillPercent}%`, backgroundColor: color }]} pointerEvents="none" />
      </View>
    </View>
  );
}

// ============================================================
// CHARTS
// ============================================================
function IntradayChart({ entries }) {
  const width = SCREEN_WIDTH - 72;
  const height = 80;
  const padding = 10;

  const timeToX = (time) => {
    const [hr, min] = time.split(':').map(Number);
    const hours = hr + min / 60;
    const adjusted = hours < 6 ? hours + 24 : hours;
    return padding + ((adjusted - 6) / 18) * (width - 2 * padding);
  };

  const moodPts = entries.filter(e => e.mood && e.time).map(e => ({
    x: timeToX(e.time),
    y: height - padding - ((e.mood - 1) / 4) * (height - 2 * padding),
  }));

  // Energy is now 0-100 scale
  const energyPts = entries.filter(e => e.energy != null && e.time).map(e => ({
    x: timeToX(e.time),
    y: height - padding - (e.energy / 100) * (height - 2 * padding),
  }));

  const makePath = (pts) => pts.length > 1
    ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    : '';

  return (
    <View style={styles.chartContainer}>
      <Svg width={width} height={height}>
        {moodPts.length > 1 && (
          <Path d={makePath(moodPts)} fill="none" stroke={COLORS.green} strokeWidth={2} />
        )}
        {moodPts.map((p, i) => (
          <Circle key={`m${i}`} cx={p.x} cy={p.y} r={4} fill={COLORS.green} stroke={COLORS.green} strokeWidth={2} />
        ))}
        {energyPts.length > 1 && (
          <Path d={makePath(energyPts)} fill="none" stroke={COLORS.orange} strokeWidth={2} strokeDasharray="4 2" />
        )}
        {energyPts.map((p, i) => (
          <Circle key={`e${i}`} cx={p.x} cy={p.y} r={3} fill={COLORS.orange} />
        ))}
      </Svg>
      <View style={styles.chartLabels}>
        <Text style={styles.chartLabel}>6 AM</Text>
        <Text style={styles.chartLabel}>12 PM</Text>
        <Text style={styles.chartLabel}>6 PM</Text>
        <Text style={styles.chartLabel}>12 AM</Text>
      </View>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: COLORS.green }]} />
          <Text style={styles.legendText}>Mood</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: COLORS.orange }]} />
          <Text style={styles.legendText}>Energy</Text>
        </View>
      </View>
    </View>
  );
}

function TrendChart({ entries, metricKey, color, min, max }) {
  const width = SCREEN_WIDTH - 72;
  const height = 100;
  const padding = 16;

  // Get last 14 days of data
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayEntries = entries.filter(e => e.date === dateStr && e[metricKey] != null);
    const avg = dayEntries.length
      ? dayEntries.reduce((s, e) => s + e[metricKey], 0) / dayEntries.length
      : null;
    days.push({ date: dateStr, value: avg });
  }

  const validDays = days.filter(d => d.value != null);
  if (validDays.length === 0) {
    return (
      <View style={[styles.chartContainer, { height: 60, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.chartNoData}>No data yet</Text>
      </View>
    );
  }

  const pts = days.map((d, i) => ({
    x: padding + (i / 13) * (width - 2 * padding),
    y: d.value != null
      ? height - padding - ((d.value - min) / (max - min)) * (height - 2 * padding)
      : null,
  })).filter(p => p.y != null);

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const avgVal = validDays.reduce((s, d) => s + d.value, 0) / validDays.length;
  const avgY = height - padding - ((avgVal - min) / (max - min)) * (height - 2 * padding);

  return (
    <View style={styles.chartContainer}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`grad-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Line x1={padding} y1={avgY} x2={width - padding} y2={avgY} stroke={color} strokeWidth={1} strokeDasharray="4 2" opacity={0.4} />
        <Path d={path} fill="none" stroke={color} strokeWidth={2.5} />
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill="white" stroke={color} strokeWidth={2} />
        ))}
      </Svg>
      <View style={styles.chartLabels}>
        <Text style={styles.chartLabel}>14d ago</Text>
        <Text style={[styles.chartLabel, { color }]}>avg {avgVal.toFixed(1)}</Text>
        <Text style={styles.chartLabel}>Today</Text>
      </View>
    </View>
  );
}

// ============================================================
// HELPERS
// ============================================================
function formatTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

// Helper to get local date string YYYY-MM-DD
function toLocalDateStr(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(dateStr) {
  // Create date object treating the string as local date (midnight)
  // Appending T00:00:00 might be interpreted as Local or UTC depending on environment
  // Best to parse manually or use T12:00:00 to avoid midnight shifts
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  const todayStr = toLocalDateStr(new Date());

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateStr(yesterday);

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';

  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  loadingText: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '500' },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 34, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },

  // Tab Bar
  tabBar: { paddingHorizontal: 20, marginBottom: 24 },
  tabBarInner: { flexDirection: 'row', backgroundColor: '#E4E4EA', borderRadius: 16, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  tabActive: { backgroundColor: COLORS.card, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3 },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.text, fontWeight: '700' },

  // Content
  content: { flex: 1, paddingHorizontal: 20 },

  // FAB
  fabContainer: { position: 'absolute', bottom: 40, right: 20, alignItems: 'flex-end', gap: 12 },
  fabSecondary: { backgroundColor: COLORS.card, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
  fabSecondaryText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  fab: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.blue, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.blue, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12 },
  fabText: { color: '#fff', fontSize: 32, fontWeight: '300', marginTop: -4 },

  // Cards
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.02)' },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  labelSecondary: { fontSize: 13, color: COLORS.textTertiary, fontWeight: '500' },

  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyEmoji: { fontSize: 64, marginBottom: 24 },
  emptyText: { fontSize: 17, color: COLORS.text, fontWeight: '600' },
  emptySubtext: { fontSize: 15, color: COLORS.textSecondary, marginTop: 8 },

  // Today View
  todayContainer: {},
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryEmoji: { fontSize: 36, marginBottom: 4 },
  summaryValue: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  summaryLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4, fontWeight: '600' },

  // Timeline
  timeline: { marginTop: 12 },
  timelineItem: { flexDirection: 'row', marginBottom: 20 },
  timelineNode: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginRight: 16, zIndex: 1, borderWidth: 4, borderColor: COLORS.background },
  timelineEmoji: { fontSize: 26 },
  timelineLine: { position: 'absolute', left: 25, top: 48, width: 2, height: '110%', backgroundColor: '#E4E4EA' },
  timelineCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 20, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  timelineTime: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  timelineMoodLabel: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },
  timelineActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 4, opacity: 0.6 },
  actionIcon: { fontSize: 16 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  pillText: { fontSize: 12, fontWeight: '600' },
  timelineNote: { fontSize: 14, color: COLORS.text, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderLight, lineHeight: 20 },

  // History View
  historyContainer: {},
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  dayHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  dayEmoji: { fontSize: 32, marginRight: 16 },
  dayTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  daySubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  chevron: { color: COLORS.textTertiary, fontSize: 14, fontWeight: '700' },
  dayEntries: { marginTop: 16, paddingLeft: 16 },
  dayEntry: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background, borderRadius: 16, padding: 16, marginBottom: 8 },
  dayEntryEmoji: { fontSize: 24, marginRight: 16 },
  dayEntryContent: { flex: 1 },
  dayEntryTime: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  dayEntryNote: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  entryTypeBadge: { fontSize: 11, fontWeight: '600', marginRight: 8 },

  // Insights View
  insightsContainer: { gap: 8 },
  avgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  avgCard: { width: '30%', backgroundColor: COLORS.background, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center' },
  avgEmoji: { fontSize: 28, marginBottom: 4 },
  avgValue: { fontSize: 22, fontWeight: '800' },
  avgLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center', fontWeight: '600' },
  todGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  todCard: { width: '48%', backgroundColor: COLORS.background, borderRadius: 16, padding: 16 },
  todLabel: { fontSize: 14, fontWeight: '700', marginBottom: 12, color: COLORS.text },
  todStats: { gap: 8 },
  todStat: { fontSize: 13 },
  todStatLabel: { color: COLORS.textSecondary, fontWeight: '500' },
  todStatValue: { fontWeight: '700' },
  todNoData: { fontSize: 12, color: COLORS.textTertiary, fontStyle: 'italic' },

  // Charts
  chartContainer: { marginTop: 16, alignItems: 'center' },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, width: '100%' },
  chartLabel: { fontSize: 12, color: COLORS.textTertiary, fontWeight: '500' },
  chartNoData: { fontSize: 14, color: COLORS.textSecondary },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLine: { width: 16, height: 4, borderRadius: 2 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  legendTextSmall: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '500' },
  trendLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },

  // Time Period Selector
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  periodSelector: { flexDirection: 'row', backgroundColor: '#E4E4EA', borderRadius: 8, padding: 2 },
  periodBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  periodBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  periodBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  periodBtnTextActive: { color: COLORS.text },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F2F2F7' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  modalCancel: { fontSize: 17, color: COLORS.blue, fontWeight: '400' },
  modalSave: { fontSize: 17, fontWeight: '700', color: COLORS.blue },
  modalSaveDisabled: { color: COLORS.textTertiary },
  modeToggle: { flexDirection: 'row', backgroundColor: '#E4E4EA', borderRadius: 10, padding: 3 },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  modeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  modeBtnTextActive: { color: COLORS.text },
  modalContent: { flex: 1, paddingHorizontal: 20 },
  timestamp: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, fontWeight: '500', marginTop: 24, marginBottom: 8 },
  timestampTappable: { color: COLORS.blue, textDecorationLine: 'underline' },
  datePickerContainer: { backgroundColor: COLORS.background, borderRadius: 12, marginVertical: 12, paddingBottom: 8 },
  datePicker: { height: 180 },
  datePickerDone: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 24, backgroundColor: COLORS.blue, borderRadius: 8, marginTop: 4 },
  datePickerDoneText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  section: { marginTop: 32 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },

  // Mood Selector
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  moodBtn: { flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 16, backgroundColor: COLORS.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  moodEmoji: { fontSize: 32 },
  moodLabel: { fontSize: 12, marginTop: 8, color: COLORS.textSecondary, fontWeight: '500' },

  // Metrics
  metricRow: { marginBottom: 24, backgroundColor: COLORS.card, padding: 16, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  metricLabel: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  metricValue: { fontSize: 16, fontWeight: '700' },
  metricLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  metricLabelSmall: { fontSize: 12, color: COLORS.textTertiary, fontWeight: '500' },
  metricNoteInput: { marginTop: 12, backgroundColor: COLORS.background, borderRadius: 8, padding: 10, fontSize: 14, color: COLORS.text },

  // Slider - increased touch area for better interaction
  sliderContainer: { height: 64, justifyContent: 'center' },
  sliderTouchArea: { height: 64, justifyContent: 'center', paddingHorizontal: 8 },
  sliderTrack: { height: 16, backgroundColor: '#E4E4EA', borderRadius: 8, overflow: 'hidden' },
  sliderFill: { height: '100%', borderRadius: 8 },
  sliderTicks: { flexDirection: 'row', position: 'absolute', top: 24, left: 0, right: 0, height: 16, zIndex: 10, justifyContent: 'space-between', paddingHorizontal: 4 },
  sliderTick: { flex: 1, height: '100%' },
  sliderTickMark: { width: 2, height: 16, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 1 },
  sliderThumb: { position: 'absolute', width: 36, height: 36, borderRadius: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, marginLeft: -18, top: 14, borderWidth: 3, borderColor: '#fff', zIndex: 15 },

  // Note Input
  noteInput: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, fontSize: 16, minHeight: 120, textAlignVertical: 'top', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, color: COLORS.text },

  // Health Grid
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  healthCard: { width: '48%', backgroundColor: COLORS.card, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  healthLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 8, fontWeight: '600' },
  healthInput: { fontSize: 20, fontWeight: '700', color: COLORS.text },

  // Reflection Cards
  reflectionCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  reflectionLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  reflectionInput: { backgroundColor: COLORS.background, borderRadius: 12, padding: 12, fontSize: 15, minHeight: 80, textAlignVertical: 'top', color: COLORS.text },

  exportBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 16,
  },
  exportBtnText: {
    fontSize: 20,
  },
});
