import { create } from 'zustand';

type BoardUiState = {
  selectedListId: string | null;
  selectedCardId: string | null;
  selectList: (listId: string) => void;
  selectCard: (cardId: string) => void;
  clearSelection: () => void;
};

export const useBoardUiStore = create<BoardUiState>((set) => ({
  selectedListId: null,
  selectedCardId: null,
  selectList: (selectedListId) => set({ selectedListId }),
  selectCard: (selectedCardId) => set({ selectedCardId }),
  clearSelection: () => set({ selectedListId: null, selectedCardId: null }),
}));
