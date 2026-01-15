/**
 * CalendarContext
 * 
 * STUB: Placeholder for fantasy calendar context.
 * Will be implemented when calendar feature is migrated.
 */
import { createContext, useContext, type ReactNode } from 'react';

interface CalendarContextValue {
    // Stub - empty until calendar is migrated
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function CalendarProvider({ children }: { children: ReactNode }) {
    return (
        <CalendarContext.Provider value={{}}>
            {children}
        </CalendarContext.Provider>
    );
}

export function useCalendar() {
    return useContext(CalendarContext) ?? {};
}
