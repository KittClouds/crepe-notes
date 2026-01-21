/**
 * ChronologyEngineStub - Stubbed (Post-Cozo Removal)
 * 
 * @module time
 */

import { v4 as uuidv4 } from 'uuid';
// import { cozoDb } from '@/lib/cozo-stubs/db';
// import { TIME_UNIT_QUERIES } from '@/lib/cozo-stubs/schema';

// TimeUnitRow stub type for ChronologyEngine
interface TimeUnitRow {
    id: string;
    calendarId: string;
    unitType: string;
    name: string;
    normalizedName: string;
    shortName?: string;
    index: number;
    daysInUnit?: number;
    direction?: string;
    startYear?: number;
    endYear?: number;
    createdAt: number;
}
import type { CalendarConfig } from '@/contexts/CalendarContext';
import type { MonthDefinition, EraDefinition } from '@/lib/fantasy-calendar/types';

export interface GenesisResult {
    calendarId: string;
    monthsRegistered: number;
    weekdaysRegistered: number;
    erasRegistered: number;
    sequenceEdges: number;
}

export async function executeGenesis(
    config: CalendarConfig,
    calendarId: string,
    months: MonthDefinition[]
): Promise<GenesisResult> {
    console.warn('[ChronologyEngine] executeGenesis disabled pending migration.');

    const result: GenesisResult = {
        calendarId,
        monthsRegistered: 0,
        weekdaysRegistered: 0,
        erasRegistered: 0,
        sequenceEdges: 0
    };
    return result;
}

export async function clearCalendarTimeUnits(calendarId: string): Promise<void> {
    console.warn('[ChronologyEngine] clearCalendarTimeUnits disabled.');
}

export function getCalendarTimeUnits(calendarId: string): TimeUnitRow[] {
    return [];
}
