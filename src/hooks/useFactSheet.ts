import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { factSheetService, type FactSheetDocument } from '@/lib/fact-sheets';
import type { EntityKind } from '@/lib/types/entityTypes';

export function useFactSheet(entityId: string | null | undefined, kind: EntityKind | undefined) {
    const queryClient = useQueryClient();

    const enabled = !!entityId && !!kind;

    // Fetch Primary Sheet
    const primaryQuery = useQuery({
        queryKey: ['fact-sheet', 'primary', entityId],
        queryFn: async () => {
            if (!entityId || !kind) return null;
            return await factSheetService.getPrimarySheet(entityId, kind);
        },
        enabled,
    });

    // Fetch Meta Sheet
    const metaQuery = useQuery({
        queryKey: ['fact-sheet', 'meta', entityId],
        queryFn: async () => {
            if (!entityId) return null;
            return await factSheetService.getMetaSheet(entityId);
        },
        enabled: !!entityId,
    });

    // Update Mutation
    const updateMutation = useMutation({
        mutationFn: async (variables: { type: 'primary' | 'meta', data: Record<string, any> }) => {
            if (!entityId) throw new Error("No entityId");
            await factSheetService.updateSheet(entityId, variables.type, variables.data);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['fact-sheet', variables.type, entityId] });
        }
    });

    return {
        primarySheet: primaryQuery.data,
        metaSheet: metaQuery.data,
        isLoading: primaryQuery.isLoading || metaQuery.isLoading,
        updatePrimary: (data: Record<string, any>) => updateMutation.mutateAsync({ type: 'primary', data }),
        updateMeta: (data: Record<string, any>) => updateMutation.mutateAsync({ type: 'meta', data }),
    };
}
