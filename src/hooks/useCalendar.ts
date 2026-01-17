// src/hooks/useCalendar.ts
// TanStack Query hooks for calendar - server state management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    loadCalendarData,
    getAllCalendarEvents,
    createCalendarEvent as createEventStorage,
    updateCalendarEvent as updateEventStorage,
    deleteCalendarEvent as deleteEventStorage,
    getAllCalendarPeriods,
    createCalendarPeriod as createPeriodStorage,
    updateCalendarPeriod as updatePeriodStorage,
    deleteCalendarPeriod as deletePeriodStorage,
    getCalendarDefinition,
    saveCalendarDefinition,
} from '@/lib/storage';
import type { CalendarEvent, Period, CalendarDefinition } from '@/lib/fantasy-calendar/types';

// Query key factory
export const calendarKeys = {
    all: ['calendar'] as const,
    events: ['calendar', 'events'] as const,
    periods: ['calendar', 'periods'] as const,
    definition: ['calendar', 'definition'] as const,
};

// Fetch all calendar data (hydration)
export function useCalendarData() {
    return useQuery({
        queryKey: calendarKeys.all,
        queryFn: loadCalendarData,
        staleTime: Infinity,
    });
}

// Fetch calendar events
export function useCalendarEvents() {
    return useQuery({
        queryKey: calendarKeys.events,
        queryFn: getAllCalendarEvents,
        staleTime: Infinity,
    });
}

// Fetch calendar periods
export function useCalendarPeriods() {
    return useQuery({
        queryKey: calendarKeys.periods,
        queryFn: getAllCalendarPeriods,
        staleTime: Infinity,
    });
}

// Fetch calendar definition
export function useCalendarDefinition() {
    return useQuery({
        queryKey: calendarKeys.definition,
        queryFn: async () => {
            const result = await getCalendarDefinition();
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
            return await createEventStorage(event);
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
            return await updateEventStorage(id, updates);
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
            await deleteEventStorage(id);
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
            return await createPeriodStorage(period);
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
            return await updatePeriodStorage(id, updates);
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
            await deletePeriodStorage(id);
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
        mutationFn: saveCalendarDefinition,
        onSuccess: (calendar) => {
            queryClient.setQueryData(calendarKeys.definition, calendar);
        },
    });
}
