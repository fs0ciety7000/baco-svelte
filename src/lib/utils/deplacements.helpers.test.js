import { describe, it, expect } from 'vitest';
import {
    detectZone,
    highlightRoles,
    getStationsWithInterventions,
    getStationText,
    formatDate,
    isValidIntervention,
    filterValidInterventions
} from './deplacements.helpers.js';

describe('detectZone', () => {
    it('should detect FTY zone for FTY-specific stations', () => {
        expect(detectZone('FTY')).toBe('FTY');
        expect(detectZone('FMC')).toBe('FTY');
        expect(detectZone('FLN')).toBe('FTY');
    });

    it('should detect FMS zone for FMS-specific stations', () => {
        expect(detectZone('FMS')).toBe('FMS');
        expect(detectZone('FSG')).toBe('FMS');
        expect(detectZone('FGH')).toBe('FMS');
    });

    it('should default to FMS for unknown stations', () => {
        expect(detectZone('UNKNOWN')).toBe('FMS');
        expect(detectZone('')).toBe('FMS');
        expect(detectZone(null)).toBe('FMS');
    });

    it('should be case insensitive', () => {
        expect(detectZone('fty')).toBe('FTY');
        expect(detectZone('fms')).toBe('FMS');
    });
});

describe('highlightRoles', () => {
    it('should highlight roles in text', () => {
        const text = 'ACP et CPI sont présents';
        const result = highlightRoles(text);
        expect(result).toContain('<b>ACP</b>');
        expect(result).toContain('<b>CPI</b>');
    });

    it('should handle multiple occurrences', () => {
        const text = 'OPI 1 et OPI 2';
        const result = highlightRoles(text);
        expect(result.match(/<b>OPI<\/b>/g)).toHaveLength(2);
    });

    it('should return empty string for null/undefined', () => {
        expect(highlightRoles(null)).toBe('');
        expect(highlightRoles(undefined)).toBe('');
        expect(highlightRoles('')).toBe('');
    });

    it('should be case insensitive', () => {
        const text = 'spi et Cpi';
        const result = highlightRoles(text);
        expect(result).toContain('<b>');
    });
});

describe('getStationsWithInterventions', () => {
    const interventions = [
        { station: 'FMS', zone: 'FMS', pmr_details: 'Test 1' },
        { station: 'FTY', zone: 'FTY', pmr_details: 'Test 2' },
        { station: 'FMS', zone: 'FMS', pmr_details: 'Test 3' }, // Duplicate
        { station: '', zone: 'FMS', pmr_details: 'Empty' } // Should be excluded
    ];

    it('should return unique stations for a zone', () => {
        const result = getStationsWithInterventions(interventions, 'FMS', 'morning');
        expect(result).toEqual(['FMS']);
    });

    it('should filter by zone', () => {
        const result = getStationsWithInterventions(interventions, 'FTY', 'morning');
        expect(result).toEqual(['FTY']);
    });

    it('should exclude empty station names', () => {
        const result = getStationsWithInterventions(interventions, 'FMS', 'morning');
        expect(result).not.toContain('');
    });

    it('should return sorted array', () => {
        const unsorted = [
            { station: 'FSG', zone: 'FMS', pmr_details: 'Test' },
            { station: 'FBC', zone: 'FMS', pmr_details: 'Test' },
            { station: 'FMS', zone: 'FMS', pmr_details: 'Test' }
        ];
        const result = getStationsWithInterventions(unsorted, 'FMS', 'morning');
        expect(result).toEqual(['FBC', 'FMS', 'FSG']);
    });
});

describe('getStationText', () => {
    const interventions = [
        { station: 'FMS', zone: 'FMS', pmr_details: 'PMR 1', assigned_to: 'CPI FMS' },
        { station: 'FMS', zone: 'FMS', pmr_details: 'PMR 2', assigned_to: 'SPI FMS' },
        { station: 'FTY', zone: 'FTY', pmr_details: 'PMR 3', assigned_to: '' }
    ];

    it('should return formatted text for station', () => {
        const result = getStationText(interventions, 'FMS', 'FMS', false);
        expect(result).toContain('PMR 1');
        expect(result).toContain('(CPI FMS)');
    });

    it('should join multiple interventions with newline', () => {
        const result = getStationText(interventions, 'FMS', 'FMS', false);
        expect(result).toContain('\n');
    });

    it('should join with <br/> for HTML', () => {
        const result = getStationText(interventions, 'FMS', 'FMS', true);
        expect(result).toContain('<br/>');
    });

    it('should highlight roles in HTML mode', () => {
        const result = getStationText(interventions, 'FMS', 'FMS', true);
        expect(result).toContain('<b>CPI</b>');
        expect(result).toContain('<b>SPI</b>');
    });

    it('should return /// for no matches', () => {
        const result = getStationText(interventions, 'UNKNOWN', null, false);
        expect(result).toBe('///');
    });

    it('should filter by zone if provided', () => {
        const result = getStationText(interventions, 'FTY', 'FTY', false);
        expect(result).toContain('PMR 3');
        expect(result).not.toContain('PMR 1');
    });
});

describe('formatDate', () => {
    it('should format date correctly', () => {
        const result = formatDate('2024-01-15');
        expect(result).toHaveProperty('display');
        expect(result).toHaveProperty('subject');
        expect(result).toHaveProperty('filename');
    });

    it('should create correct subject format', () => {
        const result = formatDate('2024-01-15');
        expect(result.subject).toBe('15-01-2024');
    });

    it('should create correct filename format', () => {
        const result = formatDate('2024-01-15');
        expect(result.filename).toBe('15-01-2024');
    });
});

describe('isValidIntervention', () => {
    it('should return true for valid intervention', () => {
        const intervention = { station: 'FMS', pmr_details: 'Test', assigned_to: 'CPI' };
        expect(isValidIntervention(intervention)).toBe(true);
    });

    it('should return false for empty station', () => {
        const intervention = { station: '', pmr_details: 'Test' };
        expect(isValidIntervention(intervention)).toBe(false);
    });

    it('should return false for whitespace-only station', () => {
        const intervention = { station: '   ', pmr_details: 'Test' };
        expect(isValidIntervention(intervention)).toBe(false);
    });

    it('should return false for null/undefined', () => {
        expect(isValidIntervention(null)).toBe(false);
        expect(isValidIntervention(undefined)).toBe(false);
    });
});

describe('filterValidInterventions', () => {
    it('should filter out invalid interventions', () => {
        const interventions = [
            { station: 'FMS', pmr_details: 'Valid' },
            { station: '', pmr_details: 'Invalid' },
            { station: 'FTY', pmr_details: 'Valid' },
            { station: '  ', pmr_details: 'Invalid' }
        ];
        const result = filterValidInterventions(interventions);
        expect(result).toHaveLength(2);
        expect(result[0].station).toBe('FMS');
        expect(result[1].station).toBe('FTY');
    });

    it('should return empty array for all invalid', () => {
        const interventions = [
            { station: '', pmr_details: 'Invalid' },
            { station: '  ', pmr_details: 'Invalid' }
        ];
        const result = filterValidInterventions(interventions);
        expect(result).toHaveLength(0);
    });
});
