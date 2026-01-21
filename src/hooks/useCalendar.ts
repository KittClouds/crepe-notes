// src/hooks/useCalendar.ts
// TanStack Query hooks for calendar - uses KittCore WASM backend

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kittCore } from '@/lib/kittcore';
import type { CalendarEvent, Period, CalendarDefinition } from '@/lib/fantasy-calendar/types';

// Default calendar/world ID
const DEFAULT_WORLD_ID = 'default';
const DEFAULT_CALENDAR_ID = 'default-calendar';

// Query key factory
export const calendarKeys = {
    all: ['calendar'] as const,
    events: ['calendar', 'events'] as const,
    periods: ['calendar', 'periods'] as const,
    definition: ['calendar', 'definition'] as const,
};

// Helper to adapt Rust records to TS types
function adaptEventFromRust(record: any): CalendarEvent {
    return {
        id: record.id,
        calendarId: record.calendar_id,
        title: record.title,
        description: record.description ?? undefined,
        date: {
            year: record.date_year,
            monthIndex: record.date_month,
            dayIndex: record.date_day,
            hour: record.date_hour ?? undefined,
            minute: record.date_minute ?? undefined,
        },
        endDate: record.end_year ? {
            year: record.end_year,
            monthIndex: record.end_month ?? record.date_month,
            dayIndex: record.end_day ?? record.date_day,
        } : undefined,
        isAllDay: record.is_all_day,
        importance: record.importance as any,
        category: record.category as any,
        color: record.color ?? undefined,
        icon: record.icon ?? undefined,
        entityId: record.entity_id ?? undefined,
        entityKind: record.entity_kind ?? undefined,
        sourceNoteId: record.source_note_id ?? undefined,
        parentEventId: record.parent_event_id ?? undefined,
        status: record.status ?? undefined,
        narrativeType: record.narrative_type ?? undefined,
        storyBeat: record.story_beat ?? undefined,
        createdAt: record.created_at ? new Date(record.created_at).toISOString() : undefined,
        updatedAt: record.updated_at ? new Date(record.updated_at).toISOString() : undefined,
    };
}

function adaptEventToRust(event: Omit<CalendarEvent, 'id'> & { id?: string }, calendarId: string): any {
    return {
        id: event.id || '',
        calendar_id: calendarId,
        title: event.title,
        description: event.description ?? null,
        date_year: event.date.year,
        date_month: event.date.monthIndex,
        date_day: event.date.dayIndex,
        date_hour: event.date.hour ?? null,
        date_minute: event.date.minute ?? null,
        end_year: event.endDate?.year ?? null,
        end_month: event.endDate?.monthIndex ?? null,
        end_day: event.endDate?.dayIndex ?? null,
        is_all_day: event.isAllDay ?? true,
        importance: event.importance ?? 'medium',
        category: event.category ?? 'general',
        color: event.color ?? null,
        icon: event.icon ?? null,
        entity_id: event.entityId ?? null,
        entity_kind: event.entityKind ?? null,
        source_note_id: event.sourceNoteId ?? null,
        parent_event_id: event.parentEventId ?? null,
        status: event.status ?? null,
        narrative_type: event.narrativeType ?? null,
        story_beat: event.storyBeat ?? null,
        created_at: 0,
        updated_at: 0,
    };
}

function adaptPeriodFromRust(record: any): Period {
    return {
        id: record.id,
        calendarId: record.calendar_id,
        name: record.name,
        description: record.description ?? undefined,
        startYear: record.start_year,
        startMonth: record.start_month ?? undefined,
        endYear: record.end_year ?? undefined,
        endMonth: record.end_month ?? undefined,
        parentPeriodId: record.parent_period_id ?? undefined,
        periodType: record.period_type as any,
        color: record.color,
        icon: record.icon ?? undefined,
        abbreviation: record.abbreviation ?? undefined,
        direction: record.direction as any ?? 'ascending',
        arcType: record.arc_type ?? undefined,
        dominantTheme: record.dominant_theme ?? undefined,
        protagonist: record.protagonist_id ? { id: record.protagonist_id, kind: '', name: '' } : undefined,
        antagonist: record.antagonist_id ? { id: record.antagonist_id, kind: '', name: '' } : undefined,
        summary: record.summary ?? undefined,
        showOnTimeline: record.show_on_timeline,
        timelineColor: record.timeline_color ?? undefined,
        timelineIcon: record.timeline_icon ?? undefined,
        createdAt: record.created_at ? new Date(record.created_at).toISOString() : undefined,
        updatedAt: record.updated_at ? new Date(record.updated_at).toISOString() : undefined,
    };
}

function adaptPeriodToRust(period: Omit<Period, 'id'> & { id?: string }, calendarId: string): any {
    return {
        id: period.id || '',
        calendar_id: calendarId,
        name: period.name,
        description: period.description ?? null,
        start_year: period.startYear,
        start_month: period.startMonth ?? null,
        end_year: period.endYear ?? null,
        end_month: period.endMonth ?? null,
        parent_period_id: period.parentPeriodId ?? null,
        period_type: period.periodType ?? 'custom',
        color: period.color ?? '#3b82f6',
        icon: period.icon ?? null,
        abbreviation: period.abbreviation ?? null,
        direction: period.direction ?? 'ascending',
        arc_type: period.arcType ?? null,
        dominant_theme: period.dominantTheme ?? null,
        protagonist_id: period.protagonist?.id ?? null,
        antagonist_id: period.antagonist?.id ?? null,
        summary: period.summary ?? null,
        show_on_timeline: period.showOnTimeline ?? true,
        timeline_color: period.timelineColor ?? null,
        timeline_icon: period.timelineIcon ?? null,
        created_at: 0,
        updated_at: 0,
    };
}

// Fetch all calendar data (hydration)
export function useCalendarData() {
    return useQuery({
        queryKey: calendarKeys.all,
        queryFn: async () => {
            const [definition, events, periods] = await Promise.all([
                kittCore.calendarGetDefinition(DEFAULT_WORLD_ID),
                kittCore.calendarGetAllEvents(DEFAULT_CALENDAR_ID),
                kittCore.calendarGetAllPeriods(DEFAULT_CALENDAR_ID),
            ]);
            return {
                calendar: definition ?? undefined,
                events: (events || []).map(adaptEventFromRust),
                periods: (periods || []).map(adaptPeriodFromRust),
            };
        },
        staleTime: Infinity,
    });
}

// Fetch calendar events
export function useCalendarEvents() {
    return useQuery({
        queryKey: calendarKeys.events,
        queryFn: async () => {
            const events = await kittCore.calendarGetAllEvents(DEFAULT_CALENDAR_ID);
            return (events || []).map(adaptEventFromRust);
        },
        staleTime: Infinity,
    });
}

// Fetch calendar periods
export function useCalendarPeriods() {
    return useQuery({
        queryKey: calendarKeys.periods,
        queryFn: async () => {
            const periods = await kittCore.calendarGetAllPeriods(DEFAULT_CALENDAR_ID);
            return (periods || []).map(adaptPeriodFromRust);
        },
        staleTime: Infinity,
    });
}

// Fetch calendar definition
export function useCalendarDefinition() {
    return useQuery({
        queryKey: calendarKeys.definition,
        queryFn: async () => {
            const result = await kittCore.calendarGetDefinition(DEFAULT_WORLD_ID);
            // TanStack Query doesn't allow undefined, return null for missing definition
            return result ?? null;
        },
        staleTime: Infinity,
    });
}

// Create event mutation
export function useCreateCalendarEvent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> => {
            const rustEvent = adaptEventToRust(event, DEFAULT_CALENDAR_ID);
            const result = await kittCore.calendarCreateEvent(rustEvent);
            return adaptEventFromRust(result);
        },
        onSuccess: (newEvent) => {
            queryClient.setQueryData<CalendarEvent[]>(calendarKeys.events, (old) =>
                old ? [...old, newEvent] : [newEvent]
            );
        },
    });
}

// Update event mutation
export function useUpdateCalendarEvent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<CalendarEvent> }): Promise<CalendarEvent | undefined> => {
            // Get current event, merge updates, re-save
            const events = queryClient.getQueryData<CalendarEvent[]>(calendarKeys.events) || [];
            const existing = events.find(e => e.id === id);
            if (!existing) return undefined;

            const merged = { ...existing, ...updates };
            const rustEvent = adaptEventToRust(merged, DEFAULT_CALENDAR_ID);
            rustEvent.id = id;
            const result = await kittCore.calendarCreateEvent(rustEvent); // Upsert
            return adaptEventFromRust(result);
        },
        onMutate: async ({ id, updates }) => {
            await queryClient.cancelQueries({ queryKey: calendarKeys.events });
            const previousEvents = queryClient.getQueryData<CalendarEvent[]>(calendarKeys.events);

            queryClient.setQueryData<CalendarEvent[]>(calendarKeys.events, (old) =>
                old?.map(e => e.id === id ? { ...e, ...updates } : e)
            );

            return { previousEvents };
        },
        onError: (_, __, context) => {
            if (context?.previousEvents) {
                queryClient.setQueryData(calendarKeys.events, context.previousEvents);
            }
        },
    });
}

// Delete event mutation
export function useDeleteCalendarEvent() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<string> => {
            await kittCore.calendarDeleteEvent(id);
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: calendarKeys.events });
            const previousEvents = queryClient.getQueryData<CalendarEvent[]>(calendarKeys.events);

            queryClient.setQueryData<CalendarEvent[]>(calendarKeys.events, (old) =>
                old?.filter(e => e.id !== id)
            );

            return { previousEvents };
        },
        onError: (_, __, context) => {
            if (context?.previousEvents) {
                queryClient.setQueryData(calendarKeys.events, context.previousEvents);
            }
        },
    });
}

// Create period mutation
export function useCreateCalendarPeriod() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (period: Omit<Period, 'id'>): Promise<Period> => {
            const rustPeriod = adaptPeriodToRust(period, DEFAULT_CALENDAR_ID);
            const result = await kittCore.calendarCreatePeriod(rustPeriod);
            return adaptPeriodFromRust(result);
        },
        onSuccess: (newPeriod) => {
            queryClient.setQueryData<Period[]>(calendarKeys.periods, (old) =>
                old ? [...old, newPeriod] : [newPeriod]
            );
        },
    });
}

// Update period mutation
export function useUpdateCalendarPeriod() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<Period> }): Promise<Period | undefined> => {
            const periods = queryClient.getQueryData<Period[]>(calendarKeys.periods) || [];
            const existing = periods.find(p => p.id === id);
            if (!existing) return undefined;

            const merged = { ...existing, ...updates };
            const rustPeriod = adaptPeriodToRust(merged, DEFAULT_CALENDAR_ID);
            rustPeriod.id = id;
            const result = await kittCore.calendarCreatePeriod(rustPeriod); // Upsert
            return adaptPeriodFromRust(result);
        },
        onMutate: async ({ id, updates }) => {
            await queryClient.cancelQueries({ queryKey: calendarKeys.periods });
            const previousPeriods = queryClient.getQueryData<Period[]>(calendarKeys.periods);

            queryClient.setQueryData<Period[]>(calendarKeys.periods, (old) =>
                old?.map(p => p.id === id ? { ...p, ...updates } : p)
            );

            return { previousPeriods };
        },
        onError: (_, __, context) => {
            if (context?.previousPeriods) {
                queryClient.setQueryData(calendarKeys.periods, context.previousPeriods);
            }
        },
    });
}

// Delete period mutation
export function useDeleteCalendarPeriod() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string): Promise<string> => {
            await kittCore.calendarDeletePeriod(id);
            return id;
        },
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: calendarKeys.periods });
            const previousPeriods = queryClient.getQueryData<Period[]>(calendarKeys.periods);

            queryClient.setQueryData<Period[]>(calendarKeys.periods, (old) =>
                old?.filter(p => p.id !== id)
            );

            return { previousPeriods };
        },
        onError: (_, __, context) => {
            if (context?.previousPeriods) {
                queryClient.setQueryData(calendarKeys.periods, context.previousPeriods);
            }
        },
    });
}

// Save calendar definition mutation
export function useSaveCalendarDefinition() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (calendar: CalendarDefinition): Promise<CalendarDefinition> => {
            // Adapt TS CalendarDefinition to Rust format
            const rustDef = {
                id: calendar.id || DEFAULT_CALENDAR_ID,
                world_id: DEFAULT_WORLD_ID,
                name: calendar.name ?? 'Default Calendar',
                hours_per_day: calendar.hoursPerDay ?? 24,
                minutes_per_hour: calendar.minutesPerHour ?? 60,
                seconds_per_minute: calendar.secondsPerMinute ?? 60,
                has_year_zero: calendar.hasYearZero ?? false,
                created_from: calendar.createdFrom ?? 'manual',
                weekdays: calendar.weekdays ?? [],
                months: calendar.months ?? [],
                eras: calendar.eras ?? [],
                epochs: calendar.epochs ?? [],
                moons: calendar.moons ?? [],
                seasons: calendar.seasons ?? [],
                current_date: calendar.currentDate ?? { year: 1, monthIndex: 0, dayIndex: 0 },
                created_at: 0,
                updated_at: 0,
            };
            await kittCore.calendarSaveDefinition(rustDef);
            return calendar;
        },
        onSuccess: (calendar) => {
            queryClient.setQueryData(calendarKeys.definition, calendar);
        },
    });
}
