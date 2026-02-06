import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { storage } from './storage';
import { MOODS } from './constants';

export const generateCSVContent = (entries) => {
    if (!entries || entries.length === 0) {
        return null;
    }

    // CSV Headers
    const headers = [
        'Date',
        'Time',
        'Mood',
        'Stress',
        'Energy',
        'Clarity',
        'Motivation',
        'Fulfillment',

        'Note',
        'Steps',
        'Sleep',
        'HeartRate',
        'Calories'
    ].join(',');

    // CSV Rows
    const rows = entries.map(entry => {
        const moodLabel = MOODS.find(m => m.value === entry.mood)?.label || 'Unknown';

        // Escape note for CSV (handle commas, quotes, newlines)
        const cleanNote = entry.note
            ? `"${entry.note.replace(/"/g, '""').replace(/\n/g, ' ')}"`
            : '';

        return [
            entry.date,
            entry.time,
            moodLabel,
            entry.stress || '',
            entry.energy || '',
            entry.clarity || '',
            entry.motivation || '',
            entry.fulfillment || '',

            cleanNote,
            entry.health?.steps || '',
            entry.health?.sleep || '',
            entry.health?.heartRate || '',
            entry.health?.calories || ''
        ].join(',');
    });

    return [headers, ...rows].join('\n');
};

export const exportToCSV = async () => {
    try {
        const entries = await storage.getEntries();
        const csvContent = generateCSVContent(entries);

        if (!csvContent) {
            alert('No data to export!');
            return;
        }

        // Create temp file
        const fileUri = FileSystem.documentDirectory + 'life_log_export.csv';
        await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

        // Share
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
                mimeType: 'text/csv',
                dialogTitle: 'Export Life Log Data',
                UTI: 'public.comma-separated-values-text'
            });
        } else {
            alert('Sharing is not available on this device');
        }
    } catch (error) {
        console.error('Export failed:', error);
        alert('Failed to export data');
    }
};

export const importFromCSV = async (onSuccess) => {
    try {
        // Pick a document
        const result = await DocumentPicker.getDocumentAsync({
            type: ['text/csv', 'text/comma-separated-values', '*/*'],
            copyToCacheDirectory: true,
        });

        if (result.canceled) {
            return { success: false, message: 'Import cancelled' };
        }

        const file = result.assets[0];

        // Read file content
        const content = await FileSystem.readAsStringAsync(file.uri, {
            encoding: FileSystem.EncodingType.UTF8,
        });

        // Parse CSV
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            alert('CSV file is empty or invalid');
            return { success: false, message: 'Empty file' };
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const entries = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            const entry = {};

            // Map CSV columns to entry fields
            const dateIdx = headers.findIndex(h => h === 'date');
            const timeIdx = headers.findIndex(h => h === 'time');
            const moodIdx = headers.findIndex(h => h === 'mood');
            const stressIdx = headers.findIndex(h => h === 'stress');
            const energyIdx = headers.findIndex(h => h === 'energy');
            const clarityIdx = headers.findIndex(h => h === 'clarity');
            const motivationIdx = headers.findIndex(h => h === 'motivation');
            const fulfillmentIdx = headers.findIndex(h => h === 'fulfillment');
            const noteIdx = headers.findIndex(h => h === 'note');
            const stepsIdx = headers.findIndex(h => h === 'steps');
            const sleepIdx = headers.findIndex(h => h === 'sleep');
            const heartRateIdx = headers.findIndex(h => h === 'heartrate');
            const caloriesIdx = headers.findIndex(h => h === 'calories');

            // Required fields
            const date = dateIdx >= 0 ? values[dateIdx] : null;
            const time = timeIdx >= 0 ? values[timeIdx] : '12:00';

            if (!date) continue; // Skip invalid rows

            // Parse mood (can be label or number)
            let moodValue = 3;
            if (moodIdx >= 0 && values[moodIdx]) {
                const moodStr = values[moodIdx];
                const moodMatch = MOODS.find(m => m.label.toLowerCase() === moodStr.toLowerCase());
                if (moodMatch) {
                    moodValue = moodMatch.value;
                } else if (!isNaN(parseInt(moodStr))) {
                    moodValue = Math.min(5, Math.max(1, parseInt(moodStr)));
                }
            }

            const timestamp = new Date(`${date}T${time || '12:00'}:00`);

            entry.id = timestamp.getTime().toString();
            entry.timestamp = timestamp.toISOString();
            entry.date = date;
            entry.time = time || '12:00';
            entry.type = 'full';
            entry.mood = moodValue;

            // Metrics
            if (stressIdx >= 0 && values[stressIdx]) entry.stress = parseInt(values[stressIdx]) || 50;
            if (energyIdx >= 0 && values[energyIdx]) entry.energy = parseInt(values[energyIdx]) || 50;
            if (clarityIdx >= 0 && values[clarityIdx]) entry.clarity = parseInt(values[clarityIdx]) || 50;
            if (motivationIdx >= 0 && values[motivationIdx]) entry.motivation = parseInt(values[motivationIdx]) || 50;
            if (fulfillmentIdx >= 0 && values[fulfillmentIdx]) entry.fulfillment = parseInt(values[fulfillmentIdx]) || 50;

            // Note
            if (noteIdx >= 0 && values[noteIdx]) entry.note = values[noteIdx];

            // Health data
            entry.health = {};
            if (stepsIdx >= 0 && values[stepsIdx]) entry.health.steps = parseInt(values[stepsIdx]) || null;
            if (sleepIdx >= 0 && values[sleepIdx]) entry.health.sleep = parseFloat(values[sleepIdx]) || null;
            if (heartRateIdx >= 0 && values[heartRateIdx]) entry.health.heartRate = parseInt(values[heartRateIdx]) || null;
            if (caloriesIdx >= 0 && values[caloriesIdx]) entry.health.calories = parseInt(values[caloriesIdx]) || null;

            entries.push(entry);
        }

        if (entries.length === 0) {
            alert('No valid entries found in CSV');
            return { success: false, message: 'No valid entries' };
        }

        // Merge with existing entries
        const existingEntries = await storage.getEntries();
        const existingIds = new Set(existingEntries.map(e => e.id));

        // Only add entries that don't already exist (by id or by date+time)
        const existingDateTimes = new Set(existingEntries.map(e => `${e.date}-${e.time}`));
        const newEntries = entries.filter(e =>
            !existingIds.has(e.id) && !existingDateTimes.has(`${e.date}-${e.time}`)
        );

        const merged = [...existingEntries, ...newEntries];
        merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        await storage.saveEntries(merged);

        alert(`Successfully imported ${newEntries.length} new entries! (${entries.length - newEntries.length} duplicates skipped)`);

        if (onSuccess) onSuccess(merged);
        return { success: true, count: newEntries.length };
    } catch (error) {
        console.error('Import failed:', error);
        alert('Failed to import data: ' + error.message);
        return { success: false, message: error.message };
    }
};

// Helper to parse CSV line (handles quoted fields with commas)
const parseCSVLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());

    return values;
};
