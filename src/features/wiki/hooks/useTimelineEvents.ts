/**
 * useTimelineEvents Hook
 * Fetches and organizes calendar events for the Wiki Timelines view.
 * 
 * STUB: Calendar system not yet migrated. Returns empty data.
 */
import { useMemo } from 'react';

// Stub type until calendar is migrated
export interface CalendarEvent {
    id: string;
    title: string;
    description?: string;
    date: {
        year: number;
        monthIndex: number;
        dayIndex: number;
    };
    category?: string;
    color?: string;
    status?: 'todo' | 'in-progress' | 'completed';
    participants?: Array<{ id: string; label: string }>;
    locations?: Array<{ id: string; label: string }>;
    artifacts?: Array<{ id: string; label: string }>;
}

export interface TimelineYear {
    year: number;
    formattedYear: string;
    events: CalendarEvent[];
}

export interface TimelineData {
    years: TimelineYear[];
    allEvents: CalendarEvent[];
    totalCount: number;
    isLoaded: boolean;
}

export function useTimelineEvents(): TimelineData {
    // STUB: Return empty data until calendar system is migrated
    const data = useMemo(() => {
        return {
            years: [],
            allEvents: [],
            totalCount: 0,
            isLoaded: true
        };
    }, []);

    return data;
}

export default useTimelineEvents;
