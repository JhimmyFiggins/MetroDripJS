import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TextInput } from 'react-native';
import { colors, fonts } from '../Checkout/src/theme';

// Controlled search input with debounce. Shop owns the query state; this
// component reports settled input via onSearch after `debounceMs` of no typing.
export default function SearchField({ value, onSearch, debounceMs = 300 }) {
    const [text, setText] = useState(value ?? '');
    const timerRef = useRef(null);

    // Sync external resets (e.g. removing the search filter chip).
    useEffect(() => {
        if (value !== undefined && value !== text) {
            setText(value);
        }
    }, [value]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const handleChange = (next) => {
        setText(next);
        if (!onSearch) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onSearch(next), debounceMs);
    };

    const handleSubmit = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (onSearch) onSearch(text);
    };

    return (
        <View style={styles.searchPill}>
            <Text style={styles.searchGlyph}>⌕</Text>
            <TextInput
                style={styles.searchInput}
                placeholder="Search products, SKU…"
                placeholderTextColor={colors.muted}
                value={text}
                onChangeText={handleChange}
                onSubmitEditing={handleSubmit}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    searchPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: 44,
        paddingHorizontal: 14,
        backgroundColor: colors.surface,
        borderRadius: 9999,
    },
    searchGlyph: {
        fontFamily: fonts.interRegular,
        fontSize: 16,
        color: colors.muted,
    },
    searchInput: {
        flex: 1,
        fontFamily: fonts.interRegular,
        fontSize: 14,
        color: colors.ink,
        padding: 0,
    },
});
