import { Board, BoardList, Card } from './types';

import { supabase } from '@/lib/supabase/client';

export type BoardRow = {
  id: string;
  title: string;
  color: string;
};

type ListRow = {
  id: string;
  board_id: string;
  title: string;
  position: number;
};

type CardRow = {
  id: string;
  list_id: string;
  title: string;
  body: string | null;
  label: string | null;
  due_at: string | null;
  position: number;
};

function mapBoard(board: BoardRow, lists: ListRow[], cards: CardRow[]): Board {
  const cardsByList = new Map<string, Card[]>();

  for (const card of cards) {
    const listCards = cardsByList.get(card.list_id) ?? [];
    listCards.push({
      id: card.id,
      listId: card.list_id,
      title: card.title,
      body: card.body ?? undefined,
      label: card.label ?? undefined,
      due: card.due_at ?? undefined,
      position: card.position,
    });
    cardsByList.set(card.list_id, listCards);
  }

  const mappedLists: BoardList[] = lists.map((list) => ({
    id: list.id,
    boardId: list.board_id,
    title: list.title,
    position: list.position,
    cards: cardsByList.get(list.id) ?? [],
  }));

  return {
    id: board.id,
    title: board.title,
    color: board.color,
    lists: mappedLists,
  };
}

export async function fetchFirstBoardForUser(userId: string): Promise<Board | null> {
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .select('id, title, color')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle<BoardRow>();

  if (boardError) {
    throw boardError;
  }

  if (!board) {
    return null;
  }

  const { data: lists, error: listsError } = await supabase
    .from('lists')
    .select('id, board_id, title, position')
    .eq('board_id', board.id)
    .order('position', { ascending: true })
    .returns<ListRow[]>();

  if (listsError) {
    throw listsError;
  }

  const listIds = lists.map((list) => list.id);
  const { data: cards, error: cardsError } = listIds.length
    ? await supabase
        .from('cards')
        .select('id, list_id, title, body, label, due_at, position')
        .in('list_id', listIds)
        .order('position', { ascending: true })
        .returns<CardRow[]>()
    : { data: [], error: null };

  if (cardsError) {
    throw cardsError;
  }

  return mapBoard(board, lists, cards ?? []);
}

export async function createStarterBoard(userId: string): Promise<BoardRow> {
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .insert({
      owner_id: userId,
      title: 'Today',
      color: '#2f6f73',
    })
    .select('id, title, color')
    .single<BoardRow>();

  if (boardError) {
    throw boardError;
  }

  const { error: listsError } = await supabase.from('lists').insert([
    { board_id: board.id, title: 'Inbox', position: 0 },
    { board_id: board.id, title: 'Active', position: 1 },
    { board_id: board.id, title: 'Later', position: 2 },
  ]);

  if (listsError) {
    throw listsError;
  }

  return board;
}
