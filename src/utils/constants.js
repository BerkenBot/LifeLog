export const MOODS = [
  { emoji: '😫', label: 'Terrible', value: 1, color: '#FF3B30' },
  { emoji: '😔', label: 'Bad', value: 2, color: '#FF9500' },
  { emoji: '😐', label: 'Okay', value: 3, color: '#FFCC00' },
  { emoji: '🙂', label: 'Good', value: 4, color: '#34C759' },
  { emoji: '😄', label: 'Great', value: 5, color: '#30D158' },
];

export const METRICS = [
  { key: 'stress', label: 'Stress', icon: '😰', color: '#FF3B30', low: 'Calm', high: 'Stressed', inverse: true },
  { key: 'energy', label: 'Energy', icon: '⚡', color: '#FF9F0A', low: 'Drained', high: 'Energized' },
  { key: 'clarity', label: 'Clarity', icon: '🧠', color: '#64D2FF', low: 'Foggy', high: 'Clear' },
  { key: 'motivation', label: 'Motivation', icon: '🎯', color: '#5E5CE6', low: 'Low', high: 'Driven' },
  { key: 'fulfillment', label: 'Fulfillment', icon: '✨', color: '#0A84FF', low: 'Empty', high: 'Fulfilled' },

];

export const SLEEP_METRIC = { key: 'sleep', label: 'Sleep', icon: '😴', color: '#5AC8FA' };
export const EXERCISE_METRIC = { key: 'exerciseMinutes', label: 'Exercise', icon: '👟', color: '#FF2D55' };

export const QUICK_METRICS = ['energy', 'stress', 'clarity'];

export const COLORS = {
  background: '#F2F2F7',
  card: '#FFFFFF',
  border: '#E5E5EA',
  borderLight: '#F2F2F7',
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  textTertiary: '#C7C7CC',
  blue: '#0A84FF',
  green: '#30D158',
  orange: '#FF9F0A',
  red: '#FF453A',
  purple: '#BF5AF2',
  indigo: '#5E5CE6',
  teal: '#64D2FF',
  yellow: '#FFD60A',
};

export const STORAGE_KEY = '@checkin_entries_v1';
