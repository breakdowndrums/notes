import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createStarterBoard, fetchFirstBoardForUser } from './board-api';
import { sampleBoard } from './sample-board';
import { Board } from './types';

async function fetchBoard(userId: string | null, isSupabaseConfigured: boolean): Promise<Board | null> {
  if (!isSupabaseConfigured) {
    return sampleBoard;
  }

  if (!userId) {
    return null;
  }

  return fetchFirstBoardForUser(userId);
}

export function useBoard(userId: string | null, isSupabaseConfigured: boolean) {
  return useQuery({
    queryKey: ['boards', 'first', userId, isSupabaseConfigured],
    queryFn: () => fetchBoard(userId, isSupabaseConfigured),
  });
}

export function useCreateStarterBoard(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('Sign in before creating a board.');
      }

      return createStarterBoard(userId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['boards', 'first'] });
    },
  });
}
