import React from 'react';
import { countryOptions, flagFor } from '../../utils/countries';

export default function CountrySelect({ value, onChange, placeholder = 'Select country' }) {
    return (
        <div className="relative">
            <select
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                value={value || ''}
                onChange={(event) => onChange(event.target.value)}
            >
                <option value="">{placeholder}</option>
                {countryOptions.map((country) => (
                    <option key={country.code} value={country.code}>
                        {flagFor(country.code)} {country.name}
                    </option>
                ))}
            </select>
        </div>
    );
}
