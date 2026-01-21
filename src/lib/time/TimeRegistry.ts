/**
 * TimeRegistryStub - Stubbed Read API for Time Units (Post-Cozo Removal)
 * 
 * Provides legacy compatibility.
 */

// import { cozoDb } from '@/lib/cozo-stubs/db'; // REMOVED
// import { TIME_UNIT_QUERIES } from '@/lib/cozo-stubs/schema'; // REMOVED

export interface MonthInfo {
    id: string;
    name: string;
    normalizedName: string;
    shortName?: string;
    index: number;
    daysInUnit: number;
}

export interface WeekdayInfo {
    id: string;
    name: string;
    normalizedName: string;
    shortName?: string;
    index: number;
}

export interface EraInfo {
    id: string;
    name: string;
    normalizedName: string;
    abbreviation?: string;
    index: number;
    direction: 'ascending' | 'descending';
    startYear?: number;
    endYear?: number;
}

export interface DateValidation {
    valid: boolean;
    maxDays: number;
    monthName: string;
}

export interface CalendarDictionary {
    calendarId: string;
    months: string[];
    weekdays: string[];
    eras: string[];
    monthIndex: Record<string, number>;
    weekdayIndex: Record<string, number>;
    monthDays: Record<string, number>;
}

export interface EntityTimelineEntry {
    id: string;
    type: 'EVENT' | 'NOTE' | 'MENTION';
    title: string;
    description?: string;
    fantasyDate: {
        year: number;
        monthIndex: number;
        dayIndex: number;
        eraId?: string;
    };
    sourceNoteId?: string;
    role?: 'participant' | 'location' | 'artifact' | 'owner';
    metadata?: Record<string, unknown>;
}

export interface EntityTimelineQuery {
    entityId: string;
    calendarId?: string;
    startYear?: number;
    endYear?: number;
    includeEvents?: boolean;
    includeNotes?: boolean;
    includeMentions?: boolean;
}

export interface EntityRelationship {
    targetEntityId: string;
    targetLabel: string;
    relationshipType: string;
    sharedEvents: number;
    sharedNotes: number;
    confidence: number;
}


class TimeRegistryImpl {
    getMonths(calendarId: string): MonthInfo[] {
        return [];
    }

    getWeekdays(calendarId: string): WeekdayInfo[] {
        return [];
    }

    getEras(calendarId: string): EraInfo[] {
        return [];
    }

    validateDate(calendarId: string, monthName: string, day: number): DateValidation {
        return { valid: true, maxDays: 31, monthName: monthName };
    }

    getCalendarDictionary(calendarId: string): CalendarDictionary {
        return {
            calendarId,
            months: [],
            weekdays: [],
            eras: [],
            monthIndex: {},
            weekdayIndex: {},
            monthDays: {}
        };
    }

    hasTimeUnits(calendarId: string): boolean {
        return false;
    }

    getEntityTimeline(query: EntityTimelineQuery): EntityTimelineEntry[] {
        return [];
    }

    getEntityRelationships(entityId: string): EntityRelationship[] {
        return [];
    }

    getEntitiesInDateRange(
        calendarId: string,
        startYear: number,
        endYear: number
    ): Array<{ entityId: string; label: string; entryCount: number }> {
        return [];
    }
}

export const TimeRegistry = new TimeRegistryImpl();
