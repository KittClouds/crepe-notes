// src/components/hub/tabs/PatternsTab.tsx
// Patterns Tab - Uses full PatternManager from legacy

import { PatternManager } from '../PatternManager';

interface PatternsTabProps {
    isLoading?: boolean;
}

export function PatternsTab({ isLoading: _isLoading }: PatternsTabProps) {
    return <PatternManager />;
}

export default PatternsTab;
