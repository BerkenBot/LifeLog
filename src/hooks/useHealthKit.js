import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

// Only import on iOS - will be null on other platforms
let AppleHealthKit = null;
let Permissions = null;

if (Platform.OS === 'ios') {
  try {
    const healthModule = require('react-native-health');
    AppleHealthKit = healthModule.default;
    Permissions = healthModule.HealthKitPermissions;
  } catch (e) {
    console.log('HealthKit not available:', e);
  }
}

const permissions = {
  permissions: {
    read: [
      AppleHealthKit?.Constants?.Permissions?.StepCount,
      AppleHealthKit?.Constants?.Permissions?.SleepAnalysis,
      AppleHealthKit?.Constants?.Permissions?.HeartRate,
      AppleHealthKit?.Constants?.Permissions?.ActiveEnergyBurned,
    ].filter(Boolean),
    write: [],
  },
};

export function useHealthKit() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !AppleHealthKit) {
      setIsAvailable(false);
      return;
    }

    AppleHealthKit.isAvailable((err, available) => {
      if (err) {
        setError(err.message);
        return;
      }
      setIsAvailable(available);
    });
  }, []);

  const requestAuthorization = useCallback(async () => {
    if (!AppleHealthKit) {
      console.log('[HealthKit] requestAuthorization: AppleHealthKit not available');
      return false;
    }

    console.log('[HealthKit] Requesting authorization...');
    return new Promise((resolve) => {
      AppleHealthKit.initHealthKit(permissions, (err) => {
        if (err) {
          console.log('[HealthKit] Authorization error:', err);
          setError(err.message);
          setIsAuthorized(false);
          resolve(false);
        } else {
          console.log('[HealthKit] Authorization successful!');
          setIsAuthorized(true);
          resolve(true);
        }
      });
    });
  }, []);

  const getTodaySteps = useCallback(async () => {
    if (!AppleHealthKit || !isAuthorized) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return new Promise((resolve) => {
      AppleHealthKit.getStepCount(
        { date: today.toISOString() },
        (err, results) => {
          if (err) {
            console.log('Steps error:', err);
            resolve(null);
          } else {
            resolve(Math.round(results?.value || 0));
          }
        }
      );
    });
  }, [isAuthorized]);

  const getLastNightSleep = useCallback(async () => {
    if (!AppleHealthKit || !isAuthorized) {
      console.log('[HealthKit] getLastNightSleep: Not authorized or HealthKit unavailable');
      return null;
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(18, 0, 0, 0);

    return new Promise((resolve) => {
      AppleHealthKit.getSleepSamples(
        {
          startDate: yesterday.toISOString(),
          endDate: now.toISOString(),
        },
        (err, results) => {
          if (err) {
            console.log('[HealthKit] Sleep error:', err);
            resolve(null);
          } else if (!results?.length) {
            console.log('[HealthKit] No sleep samples found');
            resolve(null);
          } else {
            console.log('[HealthKit] Sleep samples found:', results.length, 'Sample values:', results.map(s => s.value));
            // Include iOS 16+ sleep stages: CORE, DEEP, REM as well as legacy INBED/ASLEEP
            const validSleepValues = ['INBED', 'ASLEEP', 'CORE', 'DEEP', 'REM'];
            const sleepMs = results
              .filter(s => validSleepValues.includes(s.value))
              .reduce((total, s) => {
                const start = new Date(s.startDate);
                const end = new Date(s.endDate);
                return total + (end - start);
              }, 0);
            const hours = sleepMs / (1000 * 60 * 60);
            console.log('[HealthKit] Calculated sleep hours:', hours);
            resolve(Math.round(hours * 10) / 10);
          }
        }
      );
    });
  }, [isAuthorized]);

  const getLatestHeartRate = useCallback(async () => {
    if (!AppleHealthKit || !isAuthorized) {
      console.log('[HealthKit] getLatestHeartRate: Not authorized or HealthKit unavailable');
      return null;
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    return new Promise((resolve) => {
      AppleHealthKit.getHeartRateSamples(
        {
          startDate: yesterday.toISOString(),
          endDate: now.toISOString(),
          ascending: false,
          limit: 1,
        },
        (err, results) => {
          if (err) {
            console.log('[HealthKit] Heart rate error:', err);
            resolve(null);
          } else if (!results?.length) {
            console.log('[HealthKit] No heart rate samples found in the last 24 hours');
            resolve(null);
          } else {
            console.log('[HealthKit] Heart rate sample found:', results[0].value);
            resolve(Math.round(results[0].value));
          }
        }
      );
    });
  }, [isAuthorized]);

  const getTodayCalories = useCallback(async () => {
    if (!AppleHealthKit || !isAuthorized) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return new Promise((resolve) => {
      AppleHealthKit.getActiveEnergyBurned(
        {
          startDate: today.toISOString(),
          endDate: new Date().toISOString(),
        },
        (err, results) => {
          if (err || !results?.length) {
            resolve(null);
          } else {
            const total = results.reduce((sum, r) => sum + (r.value || 0), 0);
            resolve(Math.round(total));
          }
        }
      );
    });
  }, [isAuthorized]);

  const fetchAllHealthData = useCallback(async () => {
    console.log('[HealthKit] fetchAllHealthData called, isAuthorized:', isAuthorized);
    if (!isAuthorized) {
      console.log('[HealthKit] fetchAllHealthData: Not authorized, returning nulls');
      return { steps: null, sleep: null, heartRate: null, calories: null };
    }

    console.log('[HealthKit] Fetching all health data...');
    const [steps, sleep, heartRate, calories] = await Promise.all([
      getTodaySteps(),
      getLastNightSleep(),
      getLatestHeartRate(),
      getTodayCalories(),
    ]);

    console.log('[HealthKit] Health data fetched:', { steps, sleep, heartRate, calories });
    return { steps, sleep, heartRate, calories };
  }, [isAuthorized, getTodaySteps, getLastNightSleep, getLatestHeartRate, getTodayCalories]);

  return {
    isAvailable,
    isAuthorized,
    error,
    requestAuthorization,
    fetchAllHealthData,
  };
}
