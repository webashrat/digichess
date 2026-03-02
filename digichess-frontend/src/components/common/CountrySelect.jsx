import React, { useEffect, useMemo, useRef, useState } from 'react';
import { countryOptions, flagFor } from '../../utils/countries';

export default function CountrySelect({
    value,
    onChange,
    placeholder = 'Select country',
    showFlags = true,
    showCode = false,
    searchable = false,
}) {
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const normalizeCountryCode = (code) => {
        const normalized = String(code || '').trim().toUpperCase();
        if (!normalized || normalized === 'INTERNATIONAL' || normalized === 'INT') return 'INTL';
        return normalized;
    };

    const formatOptionLabel = (country) => {
        if (country.code === 'INTL') {
            return showCode ? 'INTL - International' : 'INTL';
        }
        const flagLabel = showFlags ? flagFor(country.code) : '';
        const codeLabel = showCode ? `${country.code} - ` : '';
        return `${flagLabel ? `${flagLabel} ` : ''}${codeLabel}${country.name}`;
    };

    const normalizedValue = normalizeCountryCode(value);

    const selectedCountry = useMemo(
        () => countryOptions.find((country) => country.code === normalizedValue) || null,
        [normalizedValue]
    );

    const filteredOptions = useMemo(() => {
        if (!searchable) return countryOptions;
        const normalized = query.trim().toLowerCase();
        if (!normalized) return countryOptions;
        return countryOptions.filter((country) => (
            country.name.toLowerCase().includes(normalized)
            || country.code.toLowerCase().includes(normalized)
        ));
    }, [query, searchable]);

    useEffect(() => {
        if (!open) return undefined;
        const handleOutside = (event) => {
            const target = event.target;
            if (!wrapperRef.current?.contains(target)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handleOutside);
        document.addEventListener('touchstart', handleOutside);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('touchstart', handleOutside);
        };
    }, [open]);

    if (!searchable) {
        return (
            <div className="relative">
                <select
                    className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                    value={normalizedValue || ''}
                    onChange={(event) => onChange(event.target.value)}
                >
                    <option value="">{placeholder}</option>
                    {countryOptions.map((country) => (
                        <option key={country.code} value={country.code}>
                            {formatOptionLabel(country)}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    const inputValue = open
        ? query
        : (selectedCountry ? formatOptionLabel(selectedCountry) : '');

    const handleSelectCountry = (countryCode) => {
        onChange(countryCode);
        setOpen(false);
        setQuery('');
        // Prevent immediate re-open from residual click/focus.
        requestAnimationFrame(() => {
            inputRef.current?.blur();
        });
    };

    return (
        <div ref={wrapperRef} className="relative mt-1">
            <input
                ref={inputRef}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                placeholder={placeholder}
                value={inputValue}
                onFocus={() => {
                    setOpen(true);
                    setQuery('');
                }}
                onChange={(event) => {
                    setOpen(true);
                    setQuery(event.target.value);
                }}
            />
            <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => {
                    setOpen((prev) => !prev);
                    if (!open) {
                        setQuery('');
                    }
                }}
            >
                <span className="material-symbols-outlined text-lg">{open ? 'expand_less' : 'expand_more'}</span>
            </button>
            {open ? (
                <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark shadow-lg">
                    {filteredOptions.length ? (
                        filteredOptions.map((country) => (
                            <button
                                key={country.code}
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                }}
                                onClick={() => handleSelectCountry(country.code)}
                            >
                                {formatOptionLabel(country)}
                            </button>
                        ))
                    ) : (
                        <div className="px-3 py-2 text-sm text-slate-500">No countries found.</div>
                    )}
                </div>
            ) : null}
        </div>
    );
}
