import AsyncStorage from '@react-native-async-storage/async-storage';

import { Note, NoteKind } from './types';

import {
  clampLibraryDayStartHour,
  DefaultLibraryDayStartHour,
  LibraryDayStartHourStorageKey,
  startOfLibraryDay,
} from '@/constants/preferences';
import { supabase } from '@/lib/supabase/client';

type NoteBoardRow = {
  board_id: string;
  assigned_at?: string | null;
};

type NoteRow = {
  id: string;
  kind: NoteKind | null;
  title: string | null;
  body: string | null;
  color: string | null;
  pinned: boolean | null;
  done?: boolean | null;
  position?: number | null;
  created_at: string | null;
  updated_at: string | null;
  note_boards?: NoteBoardRow[] | null;
  note_categories?: { category_id: string }[] | null;
};

export type CreateNoteInput = {
  kind?: NoteKind;
  title: string;
  body: string;
  boardIds: string[];
  categoryIds: string[];
  ownerId: string;
};

export type UpdateNoteInput = {
  kind?: NoteKind;
  id: string;
  title: string;
  body: string;
  boardIds: string[];
  categoryIds: string[];
};

export type DeleteNoteInput = {
  id: string;
};

export type ReorderNotesInput = {
  noteIds: string[];
};

export type RenameCategoryInput = {
  fromCategoryId: string;
  toCategoryId: string;
};

export type DeleteCategoryInput = {
  categoryId: string;
};

export type UpdateNoteDoneInput = {
  id: string;
  done: boolean;
};

export type FetchNotesInput = {
  kind?: NoteKind;
};

const BoardIds = {
  today: 'today',
  tomorrow: 'tomorrow',
  thisWeek: 'this-week',
} as const;

function isMissingColumnError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { code?: string; message?: string };

  return (
    maybeError.code === '42703' ||
    maybeError.code === 'PGRST204' ||
    Boolean(maybeError.message?.includes('schema cache'))
  );
}

function isMissingKindColumnError(error: unknown) {
  if (!isMissingColumnError(error) || !error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { message?: string };

  return Boolean(maybeError.message?.includes('kind'));
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return 'Today';
  }

  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function mapNote(row: NoteRow): Note {
  const title = row.title?.trim() ?? '';
  const body = row.body ?? '';
  const fallbackPosition = Date.parse(row.created_at ?? row.updated_at ?? '') || 0;

  return {
    id: row.id,
    kind: row.kind ?? 'note',
    title,
    body,
    color: row.color ?? '#fff3bf',
    boardIds: row.note_boards?.map((board) => board.board_id) ?? [],
    categoryIds: row.note_categories?.map((category) => category.category_id) ?? [],
    pinned: row.pinned ?? false,
    done: row.done ?? false,
    position: row.position ?? fallbackPosition,
    createdAt: row.created_at ?? row.updated_at ?? new Date().toISOString(),
    updatedAt: formatUpdatedAt(row.updated_at),
  };
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

async function getLibraryDayStartHour() {
  const storedHour = await AsyncStorage.getItem(LibraryDayStartHourStorageKey);

  if (storedHour === null) {
    return DefaultLibraryDayStartHour;
  }

  return clampLibraryDayStartHour(Number(storedHour));
}

function getNextBoardAssignments(row: NoteRow, dayStartHour: number) {
  const now = new Date();
  const todayStart = startOfLibraryDay(now, dayStartHour);
  const sixDaysAgo = addDays(todayStart, -6);
  const nextAssignments = new Map<string, string>();
  let changed = false;

  for (const board of row.note_boards ?? []) {
    const assignedAt = board.assigned_at ? new Date(board.assigned_at) : now;
    let nextBoardId: string | null = board.board_id;
    let nextAssignedAt = board.assigned_at ?? now.toISOString();

    if (board.board_id === BoardIds.today && assignedAt < todayStart) {
      nextBoardId = null;
      changed = true;
    }

    if (board.board_id === BoardIds.tomorrow && assignedAt < todayStart) {
      nextBoardId = BoardIds.today;
      nextAssignedAt = now.toISOString();
      changed = true;
    }

    if (board.board_id === BoardIds.thisWeek && assignedAt <= sixDaysAgo) {
      nextBoardId = BoardIds.today;
      nextAssignedAt = now.toISOString();
      changed = true;
    }

    if (nextBoardId) {
      nextAssignments.set(nextBoardId, nextAssignedAt);
    }
  }

  const nextBoards = [...nextAssignments.entries()].map(([board_id, assigned_at]) => ({
    board_id,
    assigned_at,
  }));

  return { changed, nextBoards };
}

async function persistBoardAssignments(noteId: string, boards: NoteBoardRow[]) {
  const { error: deleteError } = await supabase.from('note_boards').delete().eq('note_id', noteId);

  if (deleteError) {
    throw deleteError;
  }

  if (!boards.length) {
    return;
  }

  const { error: insertError } = await supabase
    .from('note_boards')
    .insert(boards.map((board) => ({ note_id: noteId, board_id: board.board_id, assigned_at: board.assigned_at })));

  if (insertError) {
    throw insertError;
  }
}

async function normalizeBoardAssignments(rows: NoteRow[]) {
  const dayStartHour = await getLibraryDayStartHour();
  const normalizedRows = rows.map((row) => {
    const { changed, nextBoards } = getNextBoardAssignments(row, dayStartHour);
    return {
      changed,
      row: {
        ...row,
        note_boards: changed ? nextBoards : row.note_boards,
      },
      nextBoards,
    };
  });

  await Promise.all(
    normalizedRows
      .filter((item) => item.changed)
      .map((item) => persistBoardAssignments(item.row.id, item.nextBoards)),
  );

  return normalizedRows.map((item) => item.row);
}

export async function fetchNotes() {
  return fetchNotesByKind({ kind: 'note' });
}

export async function fetchNotesByKind({ kind = 'note' }: FetchNotesInput = {}) {
  const modernResult = await supabase
    .from('notes')
    .select('id,kind,title,body,color,pinned,done,position,created_at,updated_at,note_boards(board_id,assigned_at),note_categories(category_id)')
    .eq('kind', kind)
    .eq('archived', false)
    .is('deleted_at', null)
    .order('position', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (!modernResult.error) {
    const rows = modernResult.data as NoteRow[];
    return (kind === 'note' ? await normalizeBoardAssignments(rows) : rows).map(mapNote);
  }

  if (!isMissingColumnError(modernResult.error)) {
    throw modernResult.error;
  }

  if (kind === 'library' && isMissingKindColumnError(modernResult.error)) {
    return [];
  }

  const noPositionResult = await supabase
    .from('notes')
    .select('id,kind,title,body,color,pinned,done,created_at,updated_at,note_boards(board_id,assigned_at),note_categories(category_id)')
    .eq('kind', kind)
    .eq('archived', false)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (!noPositionResult.error) {
    const rows = noPositionResult.data as NoteRow[];
    return (kind === 'note' ? await normalizeBoardAssignments(rows) : rows).map(mapNote);
  }

  if (!isMissingColumnError(noPositionResult.error)) {
    throw noPositionResult.error;
  }

  const legacyResult = await supabase
    .from('notes')
    .select('id,kind,title,body,color,pinned,done,created_at,updated_at,note_boards(board_id),note_categories(category_id)')
    .eq('kind', kind)
    .eq('archived', false)
    .order('updated_at', { ascending: false });

  if (!legacyResult.error) {
    return (legacyResult.data as NoteRow[]).map(mapNote);
  }

  if (isMissingKindColumnError(legacyResult.error)) {
    throw new Error('Notes and Library need the Supabase notes.kind migration before they can stay separate.');
  }

  if (!isMissingColumnError(legacyResult.error)) {
    throw legacyResult.error;
  }

  const legacyWithoutDoneResult = await supabase
    .from('notes')
    .select('id,kind,title,body,color,pinned,created_at,updated_at,note_boards(board_id),note_categories(category_id)')
    .eq('kind', kind)
    .eq('archived', false)
    .order('updated_at', { ascending: false });

  if (legacyWithoutDoneResult.error) {
    if (isMissingKindColumnError(legacyWithoutDoneResult.error)) {
      throw new Error('Notes and Library need the Supabase notes.kind migration before they can stay separate.');
    }

    throw legacyWithoutDoneResult.error;
  }

  return (legacyWithoutDoneResult.data as NoteRow[]).map(mapNote);
}

export async function createNote({ kind = 'note', title, body, boardIds, categoryIds, ownerId }: CreateNoteInput) {
  const cleanedTitle = title.trim();
  const cleanedBody = body.trim();

  const noteInsert = {
    owner_id: ownerId,
    kind,
    title: cleanedTitle,
    body: cleanedBody,
    color: '#fff3bf',
    position: Date.now(),
  };

  const insertResult = await supabase
    .from('notes')
    .insert(noteInsert)
    .select('id,kind')
    .single();

  if (kind === 'library' && insertResult.error && isMissingKindColumnError(insertResult.error)) {
    throw new Error('Library notes need the Supabase notes.kind migration before they can sync.');
  }

  const legacyInsertResult = insertResult.error && isMissingColumnError(insertResult.error)
    ? await supabase
        .from('notes')
        .insert({
          owner_id: ownerId,
          kind,
          title: cleanedTitle,
          body: cleanedBody,
          color: '#fff3bf',
        })
        .select('id,kind')
        .single()
    : insertResult;

  if (kind === 'library' && legacyInsertResult.error && isMissingKindColumnError(legacyInsertResult.error)) {
    throw new Error('Library notes need the Supabase notes.kind migration before they can sync.');
  }

  if (legacyInsertResult.error) {
    throw legacyInsertResult.error;
  }

  const savedKind = (legacyInsertResult.data as { kind?: NoteKind | null }).kind ?? 'note';

  if (savedKind !== kind) {
    throw new Error(`Supabase saved this as "${savedKind}" instead of "${kind}".`);
  }

  const noteId = legacyInsertResult.data.id as string;
  const uniqueBoardIds = kind === 'library' ? [] : [...new Set(boardIds.filter(Boolean))];
  const uniqueCategoryIds = [...new Set(categoryIds.filter(Boolean))].slice(0, 1);

  if (uniqueBoardIds.length) {
    const boardRows = uniqueBoardIds.map((boardId) => ({
      note_id: noteId,
      board_id: boardId,
      assigned_at: new Date().toISOString(),
    }));
    const { error: boardError } = await supabase
      .from('note_boards')
      .insert(boardRows);

    if (boardError) {
      if (!isMissingColumnError(boardError)) {
        throw boardError;
      }

      const { error: legacyBoardError } = await supabase
        .from('note_boards')
        .insert(uniqueBoardIds.map((boardId) => ({ note_id: noteId, board_id: boardId })));

      if (legacyBoardError) {
        throw legacyBoardError;
      }
    }
  }

  if (uniqueCategoryIds.length) {
    const { error: categoryError } = await supabase
      .from('note_categories')
      .insert(uniqueCategoryIds.map((categoryId) => ({ note_id: noteId, category_id: categoryId })));

    if (categoryError) {
      throw categoryError;
    }
  }

  return noteId;
}

export async function updateNote({ kind = 'note', id, title, body, boardIds, categoryIds }: UpdateNoteInput) {
  const cleanedTitle = title.trim();
  const cleanedBody = body.trim();

  const { error } = await supabase
    .from('notes')
    .update({
      kind,
      title: cleanedTitle,
      body: cleanedBody,
    })
    .eq('id', id);

  if (error) {
    throw error;
  }

  const uniqueBoardIds = kind === 'library' ? [] : [...new Set(boardIds.filter(Boolean))];
  const uniqueCategoryIds = [...new Set(categoryIds.filter(Boolean))].slice(0, 1);

  const { error: deleteBoardsError } = await supabase.from('note_boards').delete().eq('note_id', id);
  if (deleteBoardsError) {
    throw deleteBoardsError;
  }

  const { error: deleteCategoriesError } = await supabase.from('note_categories').delete().eq('note_id', id);
  if (deleteCategoriesError) {
    throw deleteCategoriesError;
  }

  if (uniqueBoardIds.length) {
    const boardRows = uniqueBoardIds.map((boardId) => ({
      note_id: id,
      board_id: boardId,
      assigned_at: new Date().toISOString(),
    }));
    const { error: boardError } = await supabase
      .from('note_boards')
      .insert(boardRows);

    if (boardError) {
      if (!isMissingColumnError(boardError)) {
        throw boardError;
      }

      const { error: legacyBoardError } = await supabase
        .from('note_boards')
        .insert(uniqueBoardIds.map((boardId) => ({ note_id: id, board_id: boardId })));

      if (legacyBoardError) {
        throw legacyBoardError;
      }
    }
  }

  if (uniqueCategoryIds.length) {
    const { error: categoryError } = await supabase
      .from('note_categories')
      .insert(uniqueCategoryIds.map((categoryId) => ({ note_id: id, category_id: categoryId })));

    if (categoryError) {
      throw categoryError;
    }
  }
}

export async function deleteNote({ id }: DeleteNoteInput) {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id);

  if (error) {
    throw error;
  }
}

export async function updateNoteDone({ id, done }: UpdateNoteDoneInput) {
  const { error } = await supabase
    .from('notes')
    .update({ done })
    .eq('id', id);

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error('Marking notes done needs the Supabase notes.done migration before it can sync.');
    }

    throw error;
  }
}

function replaceCategoryPath(categoryId: string, fromCategoryId: string, toCategoryId: string) {
  if (categoryId === fromCategoryId) {
    return toCategoryId;
  }

  const childPrefix = `${fromCategoryId}/`;

  if (categoryId.startsWith(childPrefix)) {
    return `${toCategoryId}/${categoryId.slice(childPrefix.length)}`;
  }

  return categoryId;
}

async function fetchNoteCategoryRowsForCategory(categoryId: string) {
  const { data, error } = await supabase
    .from('note_categories')
    .select('note_id,category_id')
    .or(`category_id.eq.${categoryId},category_id.like.${categoryId}/%`);

  if (error) {
    throw error;
  }

  return data as { note_id: string; category_id: string }[];
}

export async function renameLibraryCategory({ fromCategoryId, toCategoryId }: RenameCategoryInput) {
  const fromId = fromCategoryId.trim();
  const toId = toCategoryId.trim();

  if (!fromId || !toId || fromId === toId) {
    return;
  }

  const categoryRows = await fetchNoteCategoryRowsForCategory(fromId);

  if (!categoryRows.length) {
    return;
  }

  await Promise.all(categoryRows.map(async (row) => {
    const nextCategoryId = replaceCategoryPath(row.category_id, fromId, toId);

    const { error: deleteExistingTargetError } = await supabase
      .from('note_categories')
      .delete()
      .eq('note_id', row.note_id)
      .eq('category_id', nextCategoryId);

    if (deleteExistingTargetError) {
      throw deleteExistingTargetError;
    }

    const { error } = await supabase
      .from('note_categories')
      .update({ category_id: nextCategoryId })
      .eq('note_id', row.note_id)
      .eq('category_id', row.category_id);

    if (error) {
      throw error;
    }
  }));
}

export async function deleteLibraryCategory({ categoryId }: DeleteCategoryInput) {
  const categoryRows = await fetchNoteCategoryRowsForCategory(categoryId);

  if (!categoryRows.length) {
    return;
  }

  const { error } = await supabase
    .from('note_categories')
    .delete()
    .in('category_id', categoryRows.map((row) => row.category_id));

  if (error) {
    throw error;
  }
}

export async function reorderNotes({ noteIds }: ReorderNotesInput) {
  const topPosition = Date.now();

  await Promise.all(
    noteIds.map(async (id, index) => {
      const { error } = await supabase
        .from('notes')
        .update({ position: topPosition - index })
        .eq('id', id);

      if (error) {
        if (isMissingColumnError(error)) {
          return;
        }

        throw error;
      }
    }),
  );
}
