/**
 * Narrative Focus Context
 * 
 * Provides entity focus state for wiki tools.
 * STUB: Replaces jotai atoms with React context.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';

interface NarrativeFocusState {
    focusedEntityId: string | null;
    focusedEntityLabel: string | null;
    hasEntityFocus: boolean;
}

interface NarrativeFocusContextValue extends NarrativeFocusState {
    setFocusedEntity: (id: string | null, label: string | null) => void;
    clearFocus: () => void;
}

const NarrativeFocusContext = createContext<NarrativeFocusContextValue | null>(null);

export function NarrativeFocusProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<NarrativeFocusState>({
        focusedEntityId: null,
        focusedEntityLabel: null,
        hasEntityFocus: false,
    });

    const setFocusedEntity = (id: string | null, label: string | null) => {
        setState({
            focusedEntityId: id,
            focusedEntityLabel: label,
            hasEntityFocus: !!id,
        });
    };

    const clearFocus = () => {
        setState({
            focusedEntityId: null,
            focusedEntityLabel: null,
            hasEntityFocus: false,
        });
    };

    return (
        <NarrativeFocusContext.Provider value={{ ...state, setFocusedEntity, clearFocus }}>
            {children}
        </NarrativeFocusContext.Provider>
    );
}

export function useNarrativeFocus() {
    const context = useContext(NarrativeFocusContext);
    if (!context) {
        // Return default values if not in provider
        return {
            focusedEntityId: null,
            focusedEntityLabel: null,
            hasEntityFocus: false,
            setFocusedEntity: () => { },
            clearFocus: () => { },
        };
    }
    return context;
}
