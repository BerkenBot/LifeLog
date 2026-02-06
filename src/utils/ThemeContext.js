import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = '@lifelog_theme';

// Light theme colors
export const LIGHT_COLORS = {
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
    // Additional theme-specific colors
    tabBarBg: '#E4E4EA',
    modalBg: '#F2F2F7',
    sliderTrack: '#E4E4EA',
    codeBg: '#1e1e1e',
    codeText: '#d4d4d4',
    statusBar: 'dark-content',
};

// Dark theme colors
export const DARK_COLORS = {
    background: '#000000',
    card: '#1C1C1E',
    border: '#38383A',
    borderLight: '#2C2C2E',
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    textTertiary: '#636366',
    blue: '#0A84FF',
    green: '#30D158',
    orange: '#FF9F0A',
    red: '#FF453A',
    purple: '#BF5AF2',
    indigo: '#5E5CE6',
    teal: '#64D2FF',
    yellow: '#FFD60A',
    // Additional theme-specific colors
    tabBarBg: '#2C2C2E',
    modalBg: '#1C1C1E',
    sliderTrack: '#3A3A3C',
    codeBg: '#2C2C2E',
    codeText: '#FFFFFF',
    statusBar: 'light-content',
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [isDark, setIsDark] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Load saved theme preference
    useEffect(() => {
        loadTheme();
    }, []);

    const loadTheme = async () => {
        try {
            const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
            if (savedTheme !== null) {
                setIsDark(savedTheme === 'dark');
            }
        } catch (error) {
            console.log('Error loading theme:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleTheme = async () => {
        const newTheme = !isDark;
        setIsDark(newTheme);
        try {
            await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme ? 'dark' : 'light');
        } catch (error) {
            console.log('Error saving theme:', error);
        }
    };

    const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme, colors, isLoading }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
