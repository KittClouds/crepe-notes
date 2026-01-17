/**
 * CalendarContext - Centralized state management for Fantasy Calendar
 * Uses TanStack Query for persistence (NebulaDB) and React state for UI
 */

import React, { createContext, useContext, useCallback, useMemo, ReactNode, useState, useEffect } from 'react';
import {
    CalendarDefinition,
    FantasyDate,
    CalendarEvent,
    OrbitalMechanics,
    MonthDefinition,
    EraDefinition,
    WeekdayDefinition,
    EpochDefinition,
    TimeMarker,
    Period,
    EditorScope,
    EntityRef,
    CausalChain
} from '@/lib/fantasy-calendar/types';
import { generateOrbitalCalendar } from '@/lib/fantasy-calendar/orbital';
import {
    generateUUID,
    getDaysInMonth,
    formatYearWithEra,
    navigateYear as utilNavigateYear
} from '@/lib/fantasy-calendar/utils';
import {
    useCalendarData,
    useCalendarEvents,
    useCalendarPeriods,
    useCalendarDefinition,
    useCreateCalendarEvent,
    useUpdateCalendarEvent,
    useDeleteCalendarEvent,
    useCreateCalendarPeriod,
    useUpdateCalendarPeriod,
    useDeleteCalendarPeriod,
    useSaveCalendarDefinition,
} from '@/hooks/useCalendar';
import { useNarrativeFocus } from '@/contexts/NarrativeFocusContext';

// Configuration passed from the wizard
export interface CalendarConfig {
    name: string;
    startingYear: number;
    eraName: string;
    eraAbbreviation: string;
    monthNames: string[];
    weekdayNames: string[];
    orbitalMechanics?: OrbitalMechanics;
    eras?: EraDefinition[];
    epochs?: EpochDefinition[];
    timeMarkers?: TimeMarker[];
    hasYearZero?: boolean;
}

// Context value type - the API all components consume
export interface CalendarContextValue {
    // State
    calendar: CalendarDefinition;
    viewDate: FantasyDate;
    events: CalendarEvent[];
    isSetupMode: boolean;

    // Computed values
    currentMonth: MonthDefinition;
    daysInCurrentMonth: number;
    viewYearFormatted: string;
    eventsForCurrentMonth: CalendarEvent[];

    // Navigation
    navigateMonth: (dir: 'prev' | 'next') => void;
    navigateYear: (dir: 'prev' | 'next') => void;
    navigateDay: (dir: 'prev' | 'next') => void;
    selectDay: (dayIndex: number) => void;
    goToYear: (year: number) => void;
    goToDate: (date: FantasyDate) => void;

    // Events
    addEvent: (event: Omit<CalendarEvent, 'id' | 'calendarId'>) => CalendarEvent;
    updateEvent: (id: string, updates: Partial<Omit<CalendarEvent, 'id' | 'calendarId'>>) => void;
    removeEvent: (id: string) => void;
    getEventById: (id: string) => CalendarEvent | undefined;
    getEventsForDay: (date: FantasyDate) => CalendarEvent[];
    toggleEventStatus: (id: string) => void;

    // Time Markers
    addTimeMarker: (marker: Omit<TimeMarker, 'id' | 'calendarId'>) => void;
    removeTimeMarker: (id: string) => void;

    // Calendar Management
    createCalendar: (config: CalendarConfig) => Promise<void>;
    setIsSetupMode: (mode: boolean) => void;
    isGenerating: boolean;

    // UI State
    highlightedEventId: string | null;
    setHighlightedEventId: (id: string | null) => void;

    // Period Management
    periods: Period[];
    addPeriod: (period: Omit<Period, 'id' | 'calendarId'>) => Period;
    updatePeriod: (id: string, updates: Partial<Omit<Period, 'id' | 'calendarId'>>) => void;
    removePeriod: (id: string) => void;
    getPeriodById: (id: string) => Period | undefined;
    getRootPeriods: () => Period[];
    getChildPeriods: (periodId: string) => Period[];
    getEventsInPeriod: (periodId: string) => CalendarEvent[];
    getPeriodForYear: (year: number) => Period | undefined;

    // === NARRATIVE API ===
    editorScope: EditorScope;
    setEditorScope: (scope: EditorScope) => void;
    getEventsForScope: () => CalendarEvent[];

    // Causality
    getCausalChain: (eventId: string) => CausalChain;
    linkEvents: (causeId: string, effectId: string, weight?: number) => void;
    unlinkEvents: (causeId: string, effectId: string) => void;

    // Entity References
    addParticipant: (eventId: string, entityRef: EntityRef) => void;
    removeParticipant: (eventId: string, entityId: string) => void;
    getEventsByEntity: (entityId: string) => CalendarEvent[];

    // Display Control
    toggleCellVisibility: (eventId: string) => void;
    toggleTimelinePin: (eventId: string) => void;
    setCellDisplayMode: (eventId: string, mode: 'minimal' | 'badge' | 'full') => void;
}

// Default calendar for initial state
const DEFAULT_CALENDAR: CalendarDefinition = {
    id: 'cal_default',
    name: 'New World Calendar',
    hoursPerDay: 24,
    minutesPerHour: 60,
    secondsPerMinute: 60,
    weekdays: Array.from({ length: 7 }, (_, i) => ({
        id: `wd_${i}`, index: i, name: `Day ${i + 1}`, shortName: `D${i + 1}`
    })),
    months: Array.from({ length: 12 }, (_, i) => ({
        id: `mo_${i}`, index: i, name: `Month ${i + 1}`, shortName: `M${i + 1}`, days: 30
    })),
    eras: [{ id: 'era_1', name: 'Common Era', abbreviation: 'CE', startYear: 1, direction: 'ascending' }],
    defaultEraId: 'era_1',
    epochs: [],
    timeMarkers: [],
    hasYearZero: false,
    moons: [{ id: 'moon_1', name: 'Luna', cycleDays: 28, color: '#e2e8f0' }],
    seasons: [],
    createdFrom: 'manual'
};

const CalendarContext = createContext<CalendarContextValue | null>(null);

interface CalendarProviderProps {
    children: ReactNode;
}

export function CalendarProvider({ children }: CalendarProviderProps) {
    // TanStack Query hooks for persistence
    const { data: storedCalendar } = useCalendarDefinition();
    const { data: storedEvents = [] } = useCalendarEvents();
    const { data: storedPeriods = [] } = useCalendarPeriods();

    const createEventMutation = useCreateCalendarEvent();
    const updateEventMutation = useUpdateCalendarEvent();
    const deleteEventMutation = useDeleteCalendarEvent();
    const createPeriodMutation = useCreateCalendarPeriod();
    const updatePeriodMutation = useUpdateCalendarPeriod();
    const deletePeriodMutation = useDeleteCalendarPeriod();
    const saveCalendarMutation = useSaveCalendarDefinition();

    // Narrative focus (from context)
    const { focusedEntityId, hasEntityFocus } = useNarrativeFocus();

    // Local state
    const [isGenerating, setIsGenerating] = useState(false);
    const [localCalendar, setLocalCalendar] = useState<CalendarDefinition | null>(null);
    const [viewDate, setViewDate] = useState<FantasyDate>({ year: 1, monthIndex: 0, dayIndex: 0 });
    const [isSetupMode, setIsSetupMode] = useState(false);
    const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
    const [editorScope, setEditorScope] = useState<EditorScope>('day');

    // Use stored calendar or default
    const calendar = storedCalendar || localCalendar || DEFAULT_CALENDAR;
    const events = storedEvents;
    const periods = storedPeriods;

    // Computed values
    const currentMonth = useMemo(() =>
        calendar.months[viewDate.monthIndex] || calendar.months[0],
        [calendar.months, viewDate.monthIndex]
    );

    const daysInCurrentMonth = useMemo(() =>
        getDaysInMonth(currentMonth, viewDate.year),
        [currentMonth, viewDate.year]
    );

    const viewYearFormatted = useMemo(() =>
        formatYearWithEra(calendar, viewDate.year),
        [calendar, viewDate.year]
    );

    // Filter events by focused entity if applicable
    const filteredEvents = useMemo(() => {
        if (!hasEntityFocus || !focusedEntityId) return events;

        return events.filter(event => {
            if (event.participants?.some(p => p.id === focusedEntityId)) return true;
            if (event.locations?.some(l => l.id === focusedEntityId)) return true;
            if (event.artifacts?.some(a => a.id === focusedEntityId)) return true;
            if (event.entityId === focusedEntityId) return true;
            return false;
        });
    }, [events, hasEntityFocus, focusedEntityId]);

    const eventsForCurrentMonth = useMemo(() =>
        (hasEntityFocus ? filteredEvents : events).filter(e =>
            e.date.year === viewDate.year &&
            e.date.monthIndex === viewDate.monthIndex
        ),
        [events, filteredEvents, hasEntityFocus, viewDate.year, viewDate.monthIndex]
    );

    // Navigation
    const navigateMonth = useCallback((dir: 'prev' | 'next') => {
        setViewDate(current => {
            let newMonth = current.monthIndex + (dir === 'next' ? 1 : -1);
            let newYear = current.year;

            if (newMonth < 0) {
                newMonth = calendar.months.length - 1;
                newYear = utilNavigateYear(current.year, 'prev', calendar.hasYearZero);
            } else if (newMonth >= calendar.months.length) {
                newMonth = 0;
                newYear = utilNavigateYear(current.year, 'next', calendar.hasYearZero);
            }

            return { ...current, monthIndex: newMonth, year: newYear, dayIndex: 0 };
        });
    }, [calendar.months.length, calendar.hasYearZero]);

    const navigateYear = useCallback((dir: 'prev' | 'next') => {
        setViewDate(current => ({
            ...current,
            year: utilNavigateYear(current.year, dir, calendar.hasYearZero)
        }));
    }, [calendar.hasYearZero]);

    const navigateDay = useCallback((dir: 'prev' | 'next') => {
        const currentMonthDef = calendar.months[viewDate.monthIndex];
        const daysInMonth = getDaysInMonth(currentMonthDef, viewDate.year);

        setViewDate(current => {
            let newDay = current.dayIndex + (dir === 'next' ? 1 : -1);
            let newMonth = current.monthIndex;
            let newYear = current.year;

            if (newDay < 0) {
                newMonth = current.monthIndex - 1;
                if (newMonth < 0) {
                    newMonth = calendar.months.length - 1;
                    newYear = utilNavigateYear(current.year, 'prev', calendar.hasYearZero);
                }
                const prevMonthDef = calendar.months[newMonth];
                newDay = getDaysInMonth(prevMonthDef, newYear) - 1;
            } else if (newDay >= daysInMonth) {
                newMonth = current.monthIndex + 1;
                if (newMonth >= calendar.months.length) {
                    newMonth = 0;
                    newYear = utilNavigateYear(current.year, 'next', calendar.hasYearZero);
                }
                newDay = 0;
            }

            return { ...current, dayIndex: newDay, monthIndex: newMonth, year: newYear };
        });
    }, [calendar.months, calendar.hasYearZero, viewDate.monthIndex, viewDate.year]);

    const selectDay = useCallback((dayIndex: number) => {
        setViewDate(current => ({ ...current, dayIndex }));
    }, []);

    const goToYear = useCallback((year: number) => {
        setViewDate(current => ({ ...current, year, monthIndex: 0, dayIndex: 0 }));
    }, []);

    const goToDate = useCallback((date: FantasyDate) => {
        setViewDate(date);
    }, []);

    // Event CRUD
    const addEvent = useCallback((event: Omit<CalendarEvent, 'id' | 'calendarId'>): CalendarEvent => {
        const newEvent: CalendarEvent = {
            ...event,
            id: generateUUID(),
            calendarId: calendar.id
        };
        createEventMutation.mutate({ ...event, calendarId: calendar.id } as any);
        return newEvent;
    }, [calendar.id, createEventMutation]);

    const updateEvent = useCallback((id: string, updates: Partial<Omit<CalendarEvent, 'id' | 'calendarId'>>) => {
        updateEventMutation.mutate({ id, updates });
    }, [updateEventMutation]);

    const removeEvent = useCallback((id: string) => {
        deleteEventMutation.mutate(id);
    }, [deleteEventMutation]);

    const getEventById = useCallback((id: string): CalendarEvent | undefined => {
        return events.find(e => e.id === id);
    }, [events]);

    const getEventsForDay = useCallback((date: FantasyDate) => {
        return events.filter(e =>
            e.date.year === date.year &&
            e.date.monthIndex === date.monthIndex &&
            e.date.dayIndex === date.dayIndex
        );
    }, [events]);

    const toggleEventStatus = useCallback((id: string) => {
        const event = events.find(e => e.id === id);
        if (!event) return;

        const statusCycle: Record<string, 'todo' | 'in-progress' | 'completed'> = {
            'undefined': 'in-progress',
            'todo': 'in-progress',
            'in-progress': 'completed',
            'completed': 'todo'
        };
        const current = event.status || 'todo';
        updateEventMutation.mutate({ id, updates: { status: statusCycle[current] } });
    }, [events, updateEventMutation]);

    // Period CRUD  
    const addPeriod = useCallback((period: Omit<Period, 'id' | 'calendarId'>): Period => {
        const newPeriod: Period = {
            ...period,
            id: generateUUID(),
            calendarId: calendar.id,
            createdAt: new Date().toISOString()
        };
        createPeriodMutation.mutate({ ...period, calendarId: calendar.id, createdAt: new Date().toISOString() } as any);
        return newPeriod;
    }, [calendar.id, createPeriodMutation]);

    const updatePeriod = useCallback((id: string, updates: Partial<Omit<Period, 'id' | 'calendarId'>>) => {
        updatePeriodMutation.mutate({ id, updates: { ...updates, updatedAt: new Date().toISOString() } });
    }, [updatePeriodMutation]);

    const removePeriod = useCallback((id: string) => {
        deletePeriodMutation.mutate(id);
    }, [deletePeriodMutation]);

    const getPeriodById = useCallback((id: string): Period | undefined => {
        return periods.find(p => p.id === id);
    }, [periods]);

    const getRootPeriods = useCallback((): Period[] => {
        return periods.filter(p => !p.parentPeriodId);
    }, [periods]);

    const getChildPeriods = useCallback((periodId: string): Period[] => {
        return periods.filter(p => p.parentPeriodId === periodId);
    }, [periods]);

    const getEventsInPeriod = useCallback((periodId: string): CalendarEvent[] => {
        return events.filter(e => e.periodId === periodId);
    }, [events]);

    const getPeriodForYear = useCallback((year: number): Period | undefined => {
        return periods
            .filter(p => p.startYear <= year && (!p.endYear || p.endYear >= year))
            .sort((a, b) => {
                if (a.parentPeriodId && !b.parentPeriodId) return -1;
                if (!a.parentPeriodId && b.parentPeriodId) return 1;
                const aRange = (a.endYear || year) - a.startYear;
                const bRange = (b.endYear || year) - b.startYear;
                return aRange - bRange;
            })[0];
    }, [periods]);

    // Time Markers
    const addTimeMarker = useCallback((marker: Omit<TimeMarker, 'id' | 'calendarId'>) => {
        const newMarker: TimeMarker = {
            ...marker,
            id: generateUUID(),
            calendarId: calendar.id
        };
        const updatedCalendar: CalendarDefinition = {
            ...calendar,
            timeMarkers: [...calendar.timeMarkers, newMarker].sort((a, b) => a.year - b.year)
        };
        setLocalCalendar(updatedCalendar);
        saveCalendarMutation.mutate(updatedCalendar);
    }, [calendar, saveCalendarMutation]);

    const removeTimeMarker = useCallback((id: string) => {
        const updatedCalendar: CalendarDefinition = {
            ...calendar,
            timeMarkers: calendar.timeMarkers.filter(m => m.id !== id)
        };
        setLocalCalendar(updatedCalendar);
        saveCalendarMutation.mutate(updatedCalendar);
    }, [calendar, saveCalendarMutation]);

    // Calendar creation
    const createCalendar = useCallback(async (config: CalendarConfig) => {
        setIsGenerating(true);

        const calId = generateUUID();
        const eraId = generateUUID();

        const months: MonthDefinition[] = config.monthNames.map((name, i) => ({
            id: generateUUID(),
            index: i,
            name: name || `Month ${i + 1}`,
            shortName: name?.substring(0, 3) || `M${i + 1}`,
            days: 30
        }));

        if (months.length === 0) {
            for (let i = 0; i < 12; i++) {
                months.push({
                    id: generateUUID(),
                    index: i,
                    name: `Month ${i + 1}`,
                    shortName: `M${i + 1}`,
                    days: 30
                });
            }
        }

        const era: EraDefinition = {
            id: eraId,
            name: config.eraName || 'Common Era',
            abbreviation: config.eraAbbreviation || 'CE',
            startYear: 1,
            direction: 'ascending'
        };

        const weekdays: WeekdayDefinition[] = (config.weekdayNames || []).map((name, i) => ({
            id: generateUUID(),
            index: i,
            name: name || `Day ${i + 1}`,
            shortName: name?.substring(0, 3) || `D${i + 1}`
        }));

        if (weekdays.length === 0) {
            for (let i = 0; i < 7; i++) {
                weekdays.push({
                    id: generateUUID(),
                    index: i,
                    name: `Day ${i + 1}`,
                    shortName: `D${i + 1}`
                });
            }
        }

        const eras: EraDefinition[] = config.eras && config.eras.length > 0 ? config.eras : [era];
        const defaultEra = eras[0];

        const newCalendar: CalendarDefinition = {
            ...DEFAULT_CALENDAR,
            id: calId,
            name: config.name || 'Unnamed Calendar',
            weekdays,
            months,
            eras,
            defaultEraId: defaultEra.id,
            epochs: config.epochs || [],
            timeMarkers: config.timeMarkers || [],
            hasYearZero: config.hasYearZero ?? false,
            orbitalMechanics: config.orbitalMechanics,
            createdFrom: config.orbitalMechanics ? 'orbital' : 'manual'
        };

        setLocalCalendar(newCalendar);
        await saveCalendarMutation.mutateAsync(newCalendar);

        setViewDate({
            year: config.startingYear || 1,
            monthIndex: 0,
            dayIndex: 0,
            eraId: defaultEra.id
        });

        setIsGenerating(false);
    }, [saveCalendarMutation]);

    // Narrative API
    const getEventsForScope = useCallback((): CalendarEvent[] => {
        switch (editorScope) {
            case 'day':
                return events.filter(e =>
                    e.date.year === viewDate.year &&
                    e.date.monthIndex === viewDate.monthIndex &&
                    e.date.dayIndex === viewDate.dayIndex
                );
            case 'week': {
                const weekStart = viewDate.dayIndex;
                const weekEnd = Math.min(weekStart + 6, daysInCurrentMonth - 1);
                return events.filter(e =>
                    e.date.year === viewDate.year &&
                    e.date.monthIndex === viewDate.monthIndex &&
                    e.date.dayIndex >= weekStart &&
                    e.date.dayIndex <= weekEnd
                );
            }
            case 'month':
                return eventsForCurrentMonth;
            case 'period':
                return events;
            default:
                return events;
        }
    }, [editorScope, events, viewDate, daysInCurrentMonth, eventsForCurrentMonth]);

    const getCausalChain = useCallback((eventId: string): CausalChain => {
        const event = events.find(e => e.id === eventId);
        if (!event) return { upstream: [], downstream: [], depth: 0 };
        return {
            upstream: event.causedBy || [],
            downstream: event.causes || [],
            depth: Math.max(
                (event.causedBy?.length || 0) > 0 ? 1 : 0,
                (event.causes?.length || 0) > 0 ? 1 : 0
            )
        };
    }, [events]);

    const linkEvents = useCallback((causeId: string, effectId: string, weight: number = 1) => {
        const causeEvent = events.find(e => e.id === causeId);
        if (causeEvent) {
            const causes = new Set(causeEvent.causes || []);
            causes.add(effectId);
            updateEventMutation.mutate({ id: causeId, updates: { causes: Array.from(causes), causalityWeight: weight } });
        }
        const effectEvent = events.find(e => e.id === effectId);
        if (effectEvent) {
            const causedBy = new Set(effectEvent.causedBy || []);
            causedBy.add(causeId);
            updateEventMutation.mutate({ id: effectId, updates: { causedBy: Array.from(causedBy) } });
        }
    }, [events, updateEventMutation]);

    const unlinkEvents = useCallback((causeId: string, effectId: string) => {
        const causeEvent = events.find(e => e.id === causeId);
        if (causeEvent?.causes) {
            updateEventMutation.mutate({ id: causeId, updates: { causes: causeEvent.causes.filter(id => id !== effectId) } });
        }
        const effectEvent = events.find(e => e.id === effectId);
        if (effectEvent?.causedBy) {
            updateEventMutation.mutate({ id: effectId, updates: { causedBy: effectEvent.causedBy.filter(id => id !== causeId) } });
        }
    }, [events, updateEventMutation]);

    const addParticipant = useCallback((eventId: string, entityRef: EntityRef) => {
        const event = events.find(e => e.id === eventId);
        if (!event) return;
        const participants = event.participants || [];
        if (participants.some(p => p.id === entityRef.id)) return;
        updateEventMutation.mutate({ id: eventId, updates: { participants: [...participants, entityRef] } });
    }, [events, updateEventMutation]);

    const removeParticipant = useCallback((eventId: string, entityId: string) => {
        const event = events.find(e => e.id === eventId);
        if (!event?.participants) return;
        updateEventMutation.mutate({ id: eventId, updates: { participants: event.participants.filter(p => p.id !== entityId) } });
    }, [events, updateEventMutation]);

    const getEventsByEntity = useCallback((entityId: string): CalendarEvent[] => {
        return events.filter(e =>
            e.participants?.some(p => p.id === entityId) ||
            e.locations?.some(l => l.id === entityId) ||
            e.artifacts?.some(a => a.id === entityId)
        );
    }, [events]);

    const toggleCellVisibility = useCallback((eventId: string) => {
        const event = events.find(e => e.id === eventId);
        if (!event) return;
        updateEventMutation.mutate({ id: eventId, updates: { showInCell: !(event.showInCell ?? true) } });
    }, [events, updateEventMutation]);

    const toggleTimelinePin = useCallback((eventId: string) => {
        const event = events.find(e => e.id === eventId);
        if (!event) return;
        updateEventMutation.mutate({ id: eventId, updates: { pinnedToTimeline: !event.pinnedToTimeline } });
    }, [events, updateEventMutation]);

    const setCellDisplayMode = useCallback((eventId: string, mode: 'minimal' | 'badge' | 'full') => {
        updateEventMutation.mutate({ id: eventId, updates: { cellDisplayMode: mode } });
    }, [updateEventMutation]);

    const value: CalendarContextValue = {
        calendar,
        viewDate,
        events,
        isSetupMode,
        highlightedEventId,
        currentMonth,
        daysInCurrentMonth,
        viewYearFormatted,
        eventsForCurrentMonth,
        navigateMonth,
        navigateYear,
        navigateDay,
        selectDay,
        goToYear,
        goToDate,
        addEvent,
        updateEvent,
        removeEvent,
        getEventById,
        getEventsForDay,
        toggleEventStatus,
        setHighlightedEventId,
        periods,
        addPeriod,
        updatePeriod,
        removePeriod,
        getPeriodById,
        getRootPeriods,
        getChildPeriods,
        getEventsInPeriod,
        getPeriodForYear,
        addTimeMarker,
        removeTimeMarker,
        createCalendar,
        setIsSetupMode,
        isGenerating,
        editorScope,
        setEditorScope,
        getEventsForScope,
        getCausalChain,
        linkEvents,
        unlinkEvents,
        addParticipant,
        removeParticipant,
        getEventsByEntity,
        toggleCellVisibility,
        toggleTimelinePin,
        setCellDisplayMode
    };

    return (
        <CalendarContext.Provider value={value}>
            {children}
        </CalendarContext.Provider>
    );
}

// Hook to consume the context
export function useCalendarContext(): CalendarContextValue {
    const context = useContext(CalendarContext);
    if (!context) {
        throw new Error('useCalendarContext must be used within a CalendarProvider');
    }
    return context;
}

export default CalendarContext;
