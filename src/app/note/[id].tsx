import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, NoteSurfaceColor, Spacing } from '@/constants/theme';
import { createCompoundNotePage, deleteNote, fetchNotesByKind, updateNote, updateNoteContent } from '@/features/notes/note-api';
import {
  libraryBoards,
  sampleBoards,
  sampleCategories,
  sampleLibraryNotes,
  sampleNotes,
} from '@/features/notes/sample-notes';
import { Note, NoteKind } from '@/features/notes/types';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth/auth-provider';

const categoryToneById: Record<string, { backgroundColor: string; textColor: string }> = {
  coding: { backgroundColor: '#123023', textColor: '#9bd7aa' },
  writing: { backgroundColor: '#142840', textColor: '#9dc7f4' },
  work: { backgroundColor: '#342b12', textColor: '#e1c46a' },
  thoughts: { backgroundColor: '#102d3a', textColor: '#91d8f5' },
  references: { backgroundColor: '#33260e', textColor: '#e6bd67' },
  memories: { backgroundColor: '#1f3211', textColor: '#b8df7a' },
};

const defaultCategoryTone = { backgroundColor: '#25282b', textColor: '#c8ced3' };
const TodoCategoryStorageKeyPrefix = 'notes:todo-categories';
const CategoryKeyboardLift = 56;
const CategorySheetRowHeight = 48;
const NoteDraftStorageKeyPrefix = 'notes:editor-draft';
const AutoSaveDelay = 1000;

type StoredTodoCategories = {
  customCategoryIds: string[];
  hiddenCategoryIds: string[];
  categoryLabels: Record<string, string>;
};

type EditorSnapshot = {
  kind: NoteKind;
  title: string;
  body: string;
  boardIds: string[];
  categoryId: string | null;
};

type StoredEditorDraft = EditorSnapshot & {
  noteId: string;
  userId: string;
  savedAt: number;
};

type AutoSaveStatus = 'saved' | 'local' | 'saving' | 'error';

function getNoteDraftStorageKey(noteId: string, userId: string) {
  return `${NoteDraftStorageKeyPrefix}:${userId}:${noteId}`;
}

function snapshotsMatch(first: EditorSnapshot, second: EditorSnapshot) {
  return (
    first.kind === second.kind &&
    first.title === second.title &&
    first.body === second.body &&
    first.categoryId === second.categoryId &&
    first.boardIds.join('|') === second.boardIds.join('|')
  );
}

function snapshotMetadataMatches(first: EditorSnapshot, second: EditorSnapshot) {
  return (
    first.kind === second.kind &&
    first.categoryId === second.categoryId &&
    first.boardIds.join('|') === second.boardIds.join('|')
  );
}

function getTodoCategoryStorageKey(userId?: string) {
  return `${TodoCategoryStorageKeyPrefix}:${userId ?? 'local'}`;
}

function parseStoredTodoCategories(value: string | null): StoredTodoCategories {
  if (!value) {
    return { customCategoryIds: [], hiddenCategoryIds: [], categoryLabels: {} };
  }

  try {
    const parsed = JSON.parse(value) as string[] | Partial<StoredTodoCategories>;

    if (Array.isArray(parsed)) {
      return { customCategoryIds: parsed, hiddenCategoryIds: [], categoryLabels: {} };
    }

    return {
      customCategoryIds: Array.isArray(parsed.customCategoryIds) ? parsed.customCategoryIds : [],
      hiddenCategoryIds: Array.isArray(parsed.hiddenCategoryIds) ? parsed.hiddenCategoryIds : [],
      categoryLabels: parsed.categoryLabels && typeof parsed.categoryLabels === 'object' ? parsed.categoryLabels as Record<string, string> : {},
    };
  } catch {
    return { customCategoryIds: [], hiddenCategoryIds: [], categoryLabels: {} };
  }
}

function getCategoryTone(categoryId: string) {
  return categoryToneById[categoryId.split('/')[0].toLowerCase()] ?? defaultCategoryTone;
}

function getParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function makeCategoryId(label: string) {
  return label.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
}

function formatCategoryLabel(categoryId: string) {
  return categoryId.trim().replace(/[-_]+/g, ' ');
}

function formatCategoryTitle(categoryId: string) {
  const lastSegment = categoryId.split('/').filter(Boolean).at(-1) ?? categoryId;
  return formatCategoryLabel(lastSegment);
}

function getParentCategoryId(categoryId: string | null) {
  if (!categoryId?.includes('/')) {
    return null;
  }

  return categoryId.split('/').slice(0, -1).join('/');
}

function isDirectChildCategory(categoryId: string, parentCategoryId: string | null) {
  if (!parentCategoryId) {
    return !categoryId.includes('/');
  }

  const childPrefix = `${parentCategoryId}/`;

  return categoryId.startsWith(childPrefix) && !categoryId.slice(childPrefix.length).includes('/');
}

function getLibraryCategoryIds(notes: Note[], extraCategoryIds: string[]) {
  const categoryIds = new Set<string>();

  for (const note of notes) {
    for (const categoryId of note.categoryIds) {
      if (categoryId) {
        categoryIds.add(categoryId);
      }
    }
  }

  for (const categoryId of extraCategoryIds) {
    if (categoryId) {
      categoryIds.add(categoryId);
    }
  }

  return [...categoryIds];
}

function getTodoCategories(notes: Note[], customCategoryIds: string[]) {
  const categoryIds = new Set(sampleCategories.map((category) => category.id));

  for (const note of notes) {
    for (const categoryId of note.categoryIds) {
      if (categoryId) {
        categoryIds.add(categoryId);
      }
    }
  }

  for (const categoryId of customCategoryIds) {
    if (categoryId) {
      categoryIds.add(categoryId);
    }
  }

  return [...categoryIds].map((categoryId) => {
    const rootCategory = sampleCategories.find((category) => category.id === categoryId);

    return {
      id: categoryId,
      title: rootCategory?.title ?? formatCategoryTitle(categoryId),
      color: rootCategory?.color ?? '#64748b',
    };
  });
}

export default function NoteDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const noteId = getParam(params.id);
  const initialNoteKind: NoteKind = getParam(params.kind) === 'library' ? 'library' : 'note';
  const returnBoardId = getParam(params.returnBoardId);
  const returnCategoryId = getParam(params.returnCategoryId);
  const [noteKind, setNoteKind] = useState<NoteKind>(initialNoteKind);
  const boards = noteKind === 'library' ? libraryBoards : sampleBoards;
  const returnPath = noteKind === 'library' ? '/library' : '/';
  const queryClient = useQueryClient();
  const { isSupabaseConfigured, user } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const titleRef = useRef<TextInput>(null);
  const bodyRef = useRef<TextInput>(null);
  const todoCategoryStorageRef = useRef<StoredTodoCategories>({ customCategoryIds: [], hiddenCategoryIds: [], categoryLabels: {} });
  const categorySheetProgress = useRef(new Animated.Value(0)).current;
  const notesQuery = useQuery({
    queryKey: ['notes', noteKind, user?.id],
    queryFn: () => fetchNotesByKind({ kind: noteKind }),
    enabled: isSupabaseConfigured && Boolean(user),
  });
  const notes = user ? notesQuery.data ?? [] : noteKind === 'library' ? sampleLibraryNotes : sampleNotes;
  const note = notes.find((item) => item.id === noteId);
  const [loadedNoteId, setLoadedNoteId] = useState<string | null>(null);
  const hasLoadedNote = loadedNoteId === noteId;
  const isNoteAvailable = Boolean(note || hasLoadedNote);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryNavigationId, setCategoryNavigationId] = useState<string | null>(null);
  const [todoCategoryIds, setTodoCategoryIds] = useState<string[]>([]);
  const [hasLoadedTodoCategoryStorage, setHasLoadedTodoCategoryStorage] = useState(false);
  const [libraryCategoryIds, setLibraryCategoryIds] = useState<string[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [isCompoundActionsOpen, setIsCompoundActionsOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [focusedField, setFocusedField] = useState<'title' | 'body' | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [savedTitle, setSavedTitle] = useState('');
  const [savedBody, setSavedBody] = useState('');
  const [savedBoardIds, setSavedBoardIds] = useState<string[]>([]);
  const [savedCategoryId, setSavedCategoryId] = useState<string | null>(null);
  const [savedKind, setSavedKind] = useState<NoteKind>(initialNoteKind);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>(user ? 'saved' : 'local');
  const [isDiscardingChanges, setIsDiscardingChanges] = useState(false);
  const openingSnapshotRef = useRef<EditorSnapshot | null>(null);
  const noteAtOpenRef = useRef<Note | null>(null);
  const serverSnapshotRef = useRef<EditorSnapshot | null>(null);
  const latestSnapshotRef = useRef<EditorSnapshot | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftOwnerId = user?.id ?? 'local';
  const draftKey = getNoteDraftStorageKey(noteId, draftOwnerId);
  const selectedBoards = boards.filter((board) => selectedBoardIds.includes(board.id));
  const allTodoCategories = noteKind === 'note' ? getTodoCategories(notes, todoCategoryIds) : [];
  const allLibraryCategoryIds = noteKind === 'library' ? getLibraryCategoryIds(notes, libraryCategoryIds) : [];
  const canSave = Boolean(title.trim() || body.trim());
  const compoundNotes = noteKind === 'note' && note?.compound?.compoundId
    ? notes
        .filter((item) => item.kind === 'note' && item.compound?.compoundId === note.compound?.compoundId)
        .sort((firstNote, secondNote) => (firstNote.compound?.compoundPosition ?? 0) - (secondNote.compound?.compoundPosition ?? 0))
    : note
      ? [note]
      : [];
  const currentCompoundIndex = Math.max(0, compoundNotes.findIndex((item) => item.id === noteId));
  const saveMutation = useMutation({
    mutationFn: (input: {
      kind: NoteKind;
      id: string;
      title: string;
      body: string;
      done: boolean;
      boardIds: string[];
      categoryIds: string[];
      compound?: Note['compound'];
    }) =>
      updateNote(input),
    onMutate: async (input) => {
      const queryKey = ['notes', input.kind, user?.id] as const;

      await queryClient.cancelQueries({ queryKey });
      const previousNotes = queryClient.getQueryData<Note[]>(queryKey);

      queryClient.setQueryData<Note[]>(queryKey, (currentNotes) =>
        currentNotes?.map((currentNote) =>
          currentNote.id === input.id
            ? {
                ...currentNote,
                kind: input.kind,
                title: input.title.trim(),
                body: input.body.trim(),
                boardIds: input.kind === 'library' ? [] : input.boardIds,
                categoryIds: input.categoryIds,
                done: input.done,
                compound: input.compound ?? null,
                updatedAt: 'Today',
              }
            : currentNote,
        ) ?? [],
      );

      return { previousNotes, queryKey };
    },
    onSuccess: async (_result, input) => {
      const savedSnapshot: EditorSnapshot = {
        kind: input.kind,
        title: input.title,
        body: input.body,
        boardIds: input.kind === 'library' ? [] : input.boardIds,
        categoryId: input.categoryIds[0] ?? null,
      };
      serverSnapshotRef.current = savedSnapshot;
      setSavedTitle(input.title);
      setSavedBody(input.body);
      setSavedBoardIds(input.kind === 'library' ? [] : input.boardIds);
      setSavedCategoryId(input.categoryIds[0] ?? null);
      setSavedKind(input.kind);
      setIsEditing(false);
      setFocusedField(null);
      setAutoSaveStatus('saved');
      if (draftKey) {
        await AsyncStorage.removeItem(draftKey);
      }
    },
    onError: (error, _input, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(context.queryKey, context.previousNotes);
      }

      setAutoSaveStatus('error');
      Alert.alert('Could not save note', error instanceof Error ? error.message : 'Try again in a moment.');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  function buildSaveInput() {
    return {
        kind: noteKind,
        id: noteId,
        title,
        body,
        done: note?.done ?? false,
        compound: noteKind === 'note' ? note?.compound ?? null : null,
        boardIds: noteKind === 'library' ? [] : selectedBoardIds,
        categoryIds: selectedCategoryId ? [selectedCategoryId] : [],
    };
  }

  function getReturnRoute() {
    const routeParams: Record<string, string> = {};

    if (returnBoardId) {
      routeParams.boardId = returnBoardId;
    }

    if (returnCategoryId) {
      routeParams.categoryId = returnCategoryId;
    }

    return Object.keys(routeParams).length
      ? { pathname: returnPath, params: routeParams }
      : returnPath;
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteNote({ id: noteId }),
    onSuccess: async () => {
      if (draftKey) {
        await AsyncStorage.removeItem(draftKey);
      }
      await queryClient.cancelQueries({ queryKey: ['notes', noteKind, user?.id] });
      queryClient.setQueryData<Note[]>(['notes', noteKind, user?.id], (currentNotes) =>
        currentNotes?.filter((currentNote) => currentNote.id !== noteId) ?? [],
      );
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      router.replace(getReturnRoute() as never);
    },
    onError: (error) => {
      Alert.alert('Could not delete note', error instanceof Error ? error.message : 'Try again in a moment.');
    },
  });
  const createCompoundPageMutation = useMutation({
    mutationFn: ({ direction }: { direction: 'before' | 'after' }) => {
      if (!user || !note) {
        throw new Error('Missing source todo.');
      }

      return createCompoundNotePage({
        sourceNote: note,
        direction,
        title: '',
        body: '',
        ownerId: user.id,
      });
    },
    onSuccess: async (newNoteId) => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      router.replace({
        pathname: '/note/[id]',
        params: { id: newNoteId, kind: 'note' },
      });
    },
    onError: (error) => {
      Alert.alert('Could not add linked todo', error instanceof Error ? error.message : 'Try again in a moment.');
    },
  });

  useEffect(() => {
    if (note && loadedNoteId !== note.id) {
      const initialSnapshot: EditorSnapshot = {
        kind: noteKind,
        title: note.title,
        body: note.body,
        boardIds: noteKind === 'library' ? [] : note.boardIds,
        categoryId: note.categoryIds[0] ?? null,
      };
      openingSnapshotRef.current = initialSnapshot;
      noteAtOpenRef.current = note;
      serverSnapshotRef.current = initialSnapshot;
      latestSnapshotRef.current = initialSnapshot;
      setTitle(initialSnapshot.title);
      setBody(initialSnapshot.body);
      setSelectedBoardIds(initialSnapshot.boardIds);
      setSelectedCategoryId(initialSnapshot.categoryId);
      setCategoryNavigationId(noteKind === 'note' ? getParentCategoryId(note.categoryIds[0] ?? null) : null);
      setLibraryCategoryIds(noteKind === 'library' ? note.categoryIds.filter(Boolean) : []);
      setSavedTitle(initialSnapshot.title);
      setSavedBody(initialSnapshot.body);
      setSavedBoardIds(initialSnapshot.boardIds);
      setSavedCategoryId(initialSnapshot.categoryId);
      setSavedKind(noteKind);
      setLoadedNoteId(note.id);
      setHasHydratedDraft(false);
      setAutoSaveStatus(user ? 'saved' : 'local');

      if (!draftKey) {
        setHasHydratedDraft(true);
        return;
      }

      let cancelled = false;
      AsyncStorage.getItem(draftKey)
        .then((storedDraft) => {
          if (cancelled || !storedDraft) {
            return;
          }

          try {
            const draft = JSON.parse(storedDraft) as StoredEditorDraft;
            if (draft.noteId !== note.id || draft.userId !== draftOwnerId) {
              return;
            }

            const draftSnapshot: EditorSnapshot = {
              kind: draft.kind === 'library' ? 'library' : 'note',
              title: draft.title ?? '',
              body: draft.body ?? '',
              boardIds: Array.isArray(draft.boardIds) ? draft.boardIds : [],
              categoryId: draft.categoryId ?? null,
            };

            if (snapshotsMatch(draftSnapshot, initialSnapshot)) {
              AsyncStorage.removeItem(draftKey).catch(() => undefined);
              return;
            }

            setNoteKind(draftSnapshot.kind);
            setTitle(draftSnapshot.title);
            setBody(draftSnapshot.body);
            setSelectedBoardIds(draftSnapshot.kind === 'library' ? [] : draftSnapshot.boardIds);
            setSelectedCategoryId(draftSnapshot.categoryId);
            setCategoryNavigationId(draftSnapshot.kind === 'note' ? getParentCategoryId(draftSnapshot.categoryId) : null);
            setAutoSaveStatus('local');
          } catch {
            AsyncStorage.removeItem(draftKey).catch(() => undefined);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setHasHydratedDraft(true);
          }
        });

      return () => {
        cancelled = true;
      };
    }
  }, [draftKey, draftOwnerId, loadedNoteId, note, noteKind, user]);

  useEffect(() => {
    const currentSnapshot: EditorSnapshot = {
      kind: noteKind,
      title,
      body,
      boardIds: noteKind === 'library' ? [] : selectedBoardIds,
      categoryId: selectedCategoryId,
    };
    latestSnapshotRef.current = currentSnapshot;

    if (!hasHydratedDraft || !draftKey || !note || isDiscardingChanges) {
      return;
    }

    const serverSnapshot = serverSnapshotRef.current;
    if (serverSnapshot && snapshotsMatch(currentSnapshot, serverSnapshot)) {
      setAutoSaveStatus(user ? 'saved' : 'local');
      AsyncStorage.removeItem(draftKey).catch(() => undefined);
      return;
    }

    const storedDraft: StoredEditorDraft = {
      ...currentSnapshot,
      noteId,
      userId: draftOwnerId,
      savedAt: Date.now(),
    };
    setAutoSaveStatus((current) => (current === 'saving' ? current : 'local'));
    AsyncStorage.setItem(draftKey, JSON.stringify(storedDraft)).catch(() => setAutoSaveStatus('error'));

    if (!canSave || !user) {
      return;
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      const snapshotToSave = latestSnapshotRef.current;
      if (!snapshotToSave) {
        return;
      }

      autoSaveQueueRef.current = autoSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          setAutoSaveStatus('saving');
          const previousServerSnapshot = serverSnapshotRef.current;

          if (previousServerSnapshot && snapshotMetadataMatches(snapshotToSave, previousServerSnapshot)) {
            await updateNoteContent({
              id: noteId,
              title: snapshotToSave.title,
              body: snapshotToSave.body,
            });
          } else {
            await updateNote({
              kind: snapshotToSave.kind,
              id: noteId,
              title: snapshotToSave.title,
              body: snapshotToSave.body,
              done: note.done ?? false,
              compound: snapshotToSave.kind === 'note' ? note.compound ?? null : null,
              boardIds: snapshotToSave.kind === 'library' ? [] : snapshotToSave.boardIds,
              categoryIds: snapshotToSave.categoryId ? [snapshotToSave.categoryId] : [],
            });
          }

          serverSnapshotRef.current = snapshotToSave;
          setSavedTitle(snapshotToSave.title);
          setSavedBody(snapshotToSave.body);
          setSavedBoardIds(snapshotToSave.boardIds);
          setSavedCategoryId(snapshotToSave.categoryId);
          setSavedKind(snapshotToSave.kind);

          if (latestSnapshotRef.current && snapshotsMatch(latestSnapshotRef.current, snapshotToSave)) {
            await AsyncStorage.removeItem(draftKey);
            setAutoSaveStatus('saved');
          } else {
            setAutoSaveStatus('local');
          }

          queryClient.invalidateQueries({ queryKey: ['notes'] }).catch(() => undefined);
        })
        .catch(() => {
          setAutoSaveStatus('error');
        });
    }, AutoSaveDelay);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    body,
    canSave,
    draftKey,
    draftOwnerId,
    hasHydratedDraft,
    isDiscardingChanges,
    note,
    noteId,
    noteKind,
    queryClient,
    selectedBoardIds,
    selectedCategoryId,
    title,
    user,
  ]);

  useEffect(() => {
    if (noteKind !== 'note') {
      setHasLoadedTodoCategoryStorage(false);
      return;
    }

    AsyncStorage.getItem(getTodoCategoryStorageKey(user?.id)).then((storedCategoryIds) => {
      const parsedCategories = parseStoredTodoCategories(storedCategoryIds);
      todoCategoryStorageRef.current = parsedCategories;
      setTodoCategoryIds(parsedCategories.customCategoryIds);
      setHasLoadedTodoCategoryStorage(true);
    });
  }, [noteKind, user?.id]);

  useEffect(() => {
    if (noteKind !== 'note' || !hasLoadedTodoCategoryStorage) {
      return;
    }

    const nextStorage = {
      ...todoCategoryStorageRef.current,
      customCategoryIds: todoCategoryIds,
    };
    todoCategoryStorageRef.current = nextStorage;
    AsyncStorage.setItem(getTodoCategoryStorageKey(user?.id), JSON.stringify(nextStorage)).catch(() => undefined);
  }, [hasLoadedTodoCategoryStorage, noteKind, todoCategoryIds, user?.id]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    if (focusedField === 'title') {
      titleRef.current?.focus();
    }

    if (focusedField === 'body') {
      bodyRef.current?.focus();
    }
  }, [focusedField, isEditing]);

  function keepEditorKeyboardOpen() {
    if (!keyboardHeight || !isEditing) {
      return;
    }

    const refocusEditor = () => {
      if (focusedField === 'title') {
        titleRef.current?.focus();
      }

      if (focusedField === 'body') {
        bodyRef.current?.focus();
      }
    };

    setTimeout(refocusEditor, 40);
    setTimeout(refocusEditor, 140);
  }

  function markUnsynced() {
    setAutoSaveStatus('local');
  }

  function persistNote() {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in from Account before editing synced notes.');
      return false;
    }

    if (!note || !canSave || saveMutation.isPending) {
      return false;
    }

    saveMutation.mutate(buildSaveInput());
    setSavedTitle(title);
    setSavedBody(body);
    setSavedBoardIds(noteKind === 'library' ? [] : selectedBoardIds);
    setSavedCategoryId(selectedCategoryId);
    setSavedKind(noteKind);
    return true;
  }

  function goBack() {
    if ((!note && loadedNoteId !== noteId) || !user) {
      router.replace(getReturnRoute() as never);
      return;
    }

    const hasChanges =
      title !== savedTitle ||
      body !== savedBody ||
      noteKind !== savedKind ||
      selectedCategoryId !== savedCategoryId ||
      selectedBoardIds.join('|') !== savedBoardIds.join('|');

    if (hasChanges && canSave) {
      persistNote();
    }

    router.replace(getReturnRoute() as never);
  }

  async function discardChanges() {
    const openingSnapshot = openingSnapshotRef.current;
    const originalNote = noteAtOpenRef.current;

    if (!openingSnapshot || !originalNote || !draftKey || isDiscardingChanges) {
      return;
    }

    setIsDiscardingChanges(true);
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    try {
      await autoSaveQueueRef.current.catch(() => undefined);
      if (user) {
        await updateNote({
          kind: openingSnapshot.kind,
          id: noteId,
          title: openingSnapshot.title,
          body: openingSnapshot.body,
          done: originalNote.done ?? false,
          compound: openingSnapshot.kind === 'note' ? originalNote.compound ?? null : null,
          boardIds: openingSnapshot.kind === 'library' ? [] : openingSnapshot.boardIds,
          categoryIds: openingSnapshot.categoryId ? [openingSnapshot.categoryId] : [],
        });
      }

      serverSnapshotRef.current = openingSnapshot;
      latestSnapshotRef.current = openingSnapshot;
      setNoteKind(openingSnapshot.kind);
      setTitle(openingSnapshot.title);
      setBody(openingSnapshot.body);
      setSelectedBoardIds(openingSnapshot.boardIds);
      setSelectedCategoryId(openingSnapshot.categoryId);
      setCategoryNavigationId(openingSnapshot.kind === 'note' ? getParentCategoryId(openingSnapshot.categoryId) : null);
      setSavedTitle(openingSnapshot.title);
      setSavedBody(openingSnapshot.body);
      setSavedBoardIds(openingSnapshot.boardIds);
      setSavedCategoryId(openingSnapshot.categoryId);
      setSavedKind(openingSnapshot.kind);
      setAutoSaveStatus(user ? 'saved' : 'local');
      await AsyncStorage.removeItem(draftKey);
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
    } catch (error) {
      setAutoSaveStatus('local');
      Alert.alert('Could not discard changes', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setIsDiscardingChanges(false);
    }
  }

  function confirmDiscardChanges() {
    const openingSnapshot = openingSnapshotRef.current;
    const currentSnapshot = latestSnapshotRef.current;
    if (!openingSnapshot || !currentSnapshot || snapshotsMatch(openingSnapshot, currentSnapshot)) {
      return;
    }

    const message = 'Restore the note to how it was when you opened it? The latest changes will be removed.';
    if (Platform.OS === 'web') {
      const confirmed = typeof window === 'undefined' || window.confirm(message);
      if (confirmed) {
        discardChanges();
      }
      return;
    }

    Alert.alert('Discard latest changes?', message, [
      { text: 'Keep changes', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: discardChanges },
    ]);
  }

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });

    return () => subscription.remove();
  });

  async function toggleNoteKind() {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in from Account before moving synced notes.');
      return;
    }

    if (!note && loadedNoteId !== noteId) {
      return;
    }

    const nextKind: NoteKind = noteKind === 'library' ? 'note' : 'library';
    const nextBoardIds = nextKind === 'library' ? [] : selectedBoardIds.length ? selectedBoardIds : ['today'];

    try {
      await updateNote({
        kind: nextKind,
        id: noteId,
        title,
        body,
        done: note?.done ?? false,
        compound: nextKind === 'note' ? note?.compound ?? null : null,
        boardIds: nextBoardIds,
        categoryIds: selectedCategoryId ? [selectedCategoryId] : [],
      });
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      setNoteKind(nextKind);
      setSelectedBoardIds(nextBoardIds);
      setSavedTitle(title);
      setSavedBody(body);
      setSavedBoardIds(nextBoardIds);
      setSavedCategoryId(selectedCategoryId);
      setSavedKind(nextKind);
      setIsEditing(false);
      setFocusedField(null);
    } catch (error) {
      Alert.alert('Could not move note', error instanceof Error ? error.message : 'Try again in a moment.');
    }
  }

  function openCompoundSibling(direction: 'before' | 'after') {
    if (!note || !user || createCompoundPageMutation.isPending) {
      if (!user) {
        Alert.alert('Sign in required', 'Sign in from Account before adding linked todos.');
      }
      return;
    }

    setIsCompoundActionsOpen(false);
    createCompoundPageMutation.mutate({ direction });
  }

  function createTodoSubcategory() {
    const categorySlug = makeCategoryId(categoryDraft);

    if (!categorySlug) {
      setCategoryDraft('');
      setIsAddingCategory(false);
      return;
    }

    const categoryId = categoryNavigationId ? `${categoryNavigationId}/${categorySlug}` : categorySlug;

    setIsEditing(true);
    markUnsynced();
    setTodoCategoryIds((current) => (current.includes(categoryId) ? current : [...current, categoryId]));
    setSelectedCategoryId(categoryId);
    setCategoryNavigationId(categoryId);
    setCategoryDraft('');
    setIsAddingCategory(false);
  }

  function stepBackCategorySheet() {
    if (isCompoundActionsOpen) {
      setIsCompoundActionsOpen(false);
      return true;
    }

    if (!isCategorySheetOpen) {
      return false;
    }

    if (isAddingCategory) {
      setIsAddingCategory(false);
      setCategoryDraft('');
      return true;
    }

    if (categoryNavigationId) {
      setCategoryNavigationId(getParentCategoryId(categoryNavigationId));
      return true;
    }

    setIsCategorySheetOpen(false);
    return true;
  }

  function renderTodoCategoryDrawerRow(parentCategoryId: string | null) {
    const rowCategories = allTodoCategories.filter((category) => isDirectChildCategory(category.id, parentCategoryId));
    const currentCategory = parentCategoryId
      ? allTodoCategories.find((category) => category.id === parentCategoryId) ?? {
          id: parentCategoryId,
          title: formatCategoryTitle(parentCategoryId),
          color: '#64748b',
        }
      : null;

    return (
      <ScrollView
        key={parentCategoryId ?? 'root'}
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        style={styles.categoryDrawerScroller}
        contentContainerStyle={styles.categoryDrawerRow}>
        {parentCategoryId ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go up one category level"
              onPress={() => {
                setIsAddingCategory(false);
                setCategoryDraft('');
                setCategoryNavigationId(getParentCategoryId(parentCategoryId));
                keepEditorKeyboardOpen();
              }}
              style={({ pressed }) => [styles.categoryIconButton, pressed && styles.pressed]}>
              <Ionicons name="chevron-back" size={18} color="#c8ced3" />
            </Pressable>
            {currentCategory ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Toggle category ${currentCategory.title}`}
                accessibilityState={{ selected: selectedCategoryId === currentCategory.id }}
                onPress={() => {
                  setIsEditing(true);
                  markUnsynced();
                  setSelectedCategoryId((current) => (current === currentCategory.id ? null : currentCategory.id));
                  keepEditorKeyboardOpen();
                }}
                style={({ pressed }) => [
                  styles.categoryChip,
                  {
                    backgroundColor: getCategoryTone(currentCategory.id).backgroundColor,
                    borderColor: selectedCategoryId === currentCategory.id ? getCategoryTone(currentCategory.id).textColor : 'transparent',
                  },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={{ color: getCategoryTone(currentCategory.id).textColor }}>
                  {currentCategory.title}
                </ThemedText>
              </Pressable>
            ) : null}
          </>
        ) : null}
        {rowCategories.map((category) => {
          const selected = selectedCategoryId === category.id;

          return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={`Open category ${category.title}`}
              accessibilityState={{ selected }}
              onPress={() => {
                setIsEditing(true);
                markUnsynced();
                setIsCategorySheetOpen(true);
                setCategoryNavigationId(category.id);
                setSelectedCategoryId(category.id);
                keepEditorKeyboardOpen();
              }}
              style={({ pressed }) => [
                styles.categoryChip,
                {
                  backgroundColor: getCategoryTone(category.id).backgroundColor,
                  borderColor: selected ? getCategoryTone(category.id).textColor : 'transparent',
                },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={{ color: getCategoryTone(category.id).textColor }}>
                {category.title}
              </ThemedText>
            </Pressable>
          );
        })}
        {isAddingCategory && categoryNavigationId === parentCategoryId ? (
          <TextInput
            value={categoryDraft}
            onChangeText={setCategoryDraft}
            onSubmitEditing={createTodoSubcategory}
            onBlur={createTodoSubcategory}
            autoFocus
            autoCapitalize="sentences"
            placeholder={parentCategoryId ? 'Subcategory' : 'Category'}
            placeholderTextColor={theme.textSecondary}
            style={[styles.categoryInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={parentCategoryId ? 'Create todo subcategory' : 'Create todo category'}
            onPress={() => {
              setIsCategorySheetOpen(true);
              setCategoryNavigationId(parentCategoryId);
              setIsAddingCategory(true);
            }}
            style={({ pressed }) => [styles.categoryChip, pressed && styles.pressed]}>
            <ThemedText type="smallBold">+</ThemedText>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  function renderLibraryCategoryDrawerRow() {
    const rowCategories = allLibraryCategoryIds.map((id) => ({ id, title: id, color: '#64748b' }));

    return (
      <View style={styles.libraryCategoryDrawerRow}>
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          style={styles.categoryDrawerScroller}
          contentContainerStyle={styles.categoryDrawerRow}>
          {rowCategories.map((category) => {
            const selected = selectedCategoryId === category.id;

            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityLabel={`Toggle category ${category.title}`}
                accessibilityState={{ selected }}
                onPress={() => {
                  setIsEditing(true);
                  markUnsynced();
                  setSelectedCategoryId((current) => (current === category.id ? null : category.id));
                  keepEditorKeyboardOpen();
                }}
                style={({ pressed }) => [
                  styles.categoryChip,
                  {
                    backgroundColor: getCategoryTone(category.id).backgroundColor,
                    borderColor: selected ? getCategoryTone(category.id).textColor : 'transparent',
                  },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={{ color: getCategoryTone(category.id).textColor }}>
                  {category.title}
                </ThemedText>
              </Pressable>
            );
          })}
          {isAddingCategory ? (
            <TextInput
              value={categoryDraft}
              onChangeText={setCategoryDraft}
              onSubmitEditing={() => {
                const categoryId = makeCategoryId(categoryDraft);
                if (categoryId) {
                  setIsEditing(true);
                  markUnsynced();
                  setLibraryCategoryIds((current) => (current.includes(categoryId) ? current : [...current, categoryId]));
                  setSelectedCategoryId(categoryId);
                }
                setCategoryDraft('');
                setIsAddingCategory(false);
              }}
              autoFocus
              autoCapitalize="sentences"
              placeholder="Category"
              placeholderTextColor={theme.textSecondary}
              style={[styles.categoryInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create library category"
              onPress={() => {
                setIsCategorySheetOpen(true);
                setIsAddingCategory(true);
              }}
              style={({ pressed }) => [styles.categoryChip, pressed && styles.pressed]}>
              <ThemedText type="smallBold">+</ThemedText>
            </Pressable>
          )}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          onPress={() => router.push('/explore')}
          style={({ pressed }) => [styles.categorySettingsButton, pressed && styles.pressed]}>
          <Ionicons name="settings-outline" size={20} color="#555d64" />
        </Pressable>
      </View>
    );
  }
  function confirmDeleteNote() {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in from Account before deleting synced notes.');
      return;
    }

    if (!note || deleteMutation.isPending) {
      return;
    }

    if (Platform.OS === 'web') {
      const confirmed = typeof window === 'undefined' || window.confirm('Delete note? This permanently removes the note from your account.');

      if (confirmed) {
        deleteMutation.mutate();
      }

      return;
    }

    Alert.alert('Delete note?', 'This permanently removes the note from your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  }

  const todoCategoryDrawerParents = [null, ...(categoryNavigationId ? [categoryNavigationId] : [])];
  const categoryDrawerParents = noteKind === 'note' ? todoCategoryDrawerParents : [null];
  const categoryDrawerIndex = isCategorySheetOpen ? (noteKind === 'note' && categoryNavigationId ? 2 : 1) : 0;
  const openingSnapshot = openingSnapshotRef.current;
  const currentSnapshot = latestSnapshotRef.current;
  const canDiscardChanges = Boolean(
    openingSnapshot &&
    currentSnapshot &&
    !snapshotsMatch(openingSnapshot, currentSnapshot),
  );
  const saveStatusLabel = autoSaveStatus === 'error'
      ? 'Sync failed · saved locally'
    : autoSaveStatus === 'local' || autoSaveStatus === 'saving'
      ? user
        ? 'Unsynced · saved locally'
        : 'Local only · sign in to sync'
      : 'Saved';

  useEffect(() => {
    Animated.timing(categorySheetProgress, {
      toValue: categoryDrawerIndex,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [categoryDrawerIndex, categorySheetProgress]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to notes"
              onPress={goBack}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </Pressable>
            {noteKind === 'note' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isCompoundActionsOpen ? 'Hide linked todo actions' : 'Show linked todo actions'}
                onPress={() => setIsCompoundActionsOpen((current) => !current)}
                style={({ pressed }) => [styles.plainIconButton, pressed && styles.pressed]}>
                <Ionicons name="git-branch-outline" size={21} color={theme.text} />
              </Pressable>
            ) : null}
            <View style={styles.headerSpacer}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.saveStatusText}>
                {noteKind === 'note' && compoundNotes.length > 1
                  ? `${currentCompoundIndex + 1} of ${compoundNotes.length} · ${saveStatusLabel}`
                  : saveStatusLabel}
              </ThemedText>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Discard changes since opening note"
                disabled={!canDiscardChanges || isDiscardingChanges}
                onPress={confirmDiscardChanges}
                style={({ pressed }) => [
                  styles.plainIconButton,
                  (!canDiscardChanges || isDiscardingChanges) && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <Ionicons name="arrow-undo-outline" size={20} color={theme.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete note"
                disabled={!note || deleteMutation.isPending}
                onPress={confirmDeleteNote}
                style={({ pressed }) => [
                  styles.iconButton,
                  styles.deleteButton,
                  (!note || deleteMutation.isPending) && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <Ionicons name="trash-outline" size={20} color={theme.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={noteKind === 'library' ? 'Move note to todo' : 'Move note to library'}
                disabled={!isNoteAvailable || saveMutation.isPending}
                onPress={toggleNoteKind}
                style={({ pressed }) => [
                  styles.kindToggleButton,
                  (!isNoteAvailable || saveMutation.isPending) && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <Ionicons name={noteKind === 'library' ? 'albums-outline' : 'checkbox-outline'} size={21} color={theme.text} />
              </Pressable>
            </View>
          </View>
          {noteKind === 'note' && isCompoundActionsOpen ? (
            <View style={styles.compoundActionsPanel}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add note before"
                onPress={() => openCompoundSibling('before')}
                style={({ pressed }) => [styles.compoundActionButton, pressed && styles.pressed]}>
                <Ionicons name="add-outline" size={18} color={theme.text} />
                <ThemedText type="smallBold">Before</ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add note after"
                onPress={() => openCompoundSibling('after')}
                style={({ pressed }) => [styles.compoundActionButton, pressed && styles.pressed]}>
                <Ionicons name="add-outline" size={18} color={theme.text} />
                <ThemedText type="smallBold">After</ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open previous linked note"
                disabled={currentCompoundIndex <= 0}
                onPress={() => {
                  setIsCompoundActionsOpen(false);
                  const previousNote = compoundNotes[currentCompoundIndex - 1];
                  if (previousNote) {
                    router.replace({
                      pathname: '/note/[id]',
                      params: { id: previousNote.id, kind: 'note' },
                    });
                  }
                }}
                style={({ pressed }) => [
                  styles.compoundActionButton,
                  currentCompoundIndex <= 0 && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <Ionicons name="chevron-back" size={18} color={theme.text} />
                <ThemedText type="smallBold">Previous</ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open next linked note"
                disabled={currentCompoundIndex >= compoundNotes.length - 1}
                onPress={() => {
                  setIsCompoundActionsOpen(false);
                  const nextNote = compoundNotes[currentCompoundIndex + 1];
                  if (nextNote) {
                    router.replace({
                      pathname: '/note/[id]',
                      params: { id: nextNote.id, kind: 'note' },
                    });
                  }
                }}
                style={({ pressed }) => [
                  styles.compoundActionButton,
                  currentCompoundIndex >= compoundNotes.length - 1 && styles.disabled,
                  pressed && styles.pressed,
                ]}>
                <Ionicons name="chevron-forward" size={18} color={theme.text} />
                <ThemedText type="smallBold">Next</ThemedText>
              </Pressable>
            </View>
          ) : null}

          {!isNoteAvailable ? (
            <View style={[styles.emptyState, { borderColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold">Note not found.</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                It may still be loading, or it may have been deleted.
              </ThemedText>
            </View>
          ) : (
            <>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                onTouchStart={stepBackCategorySheet}
                contentContainerStyle={styles.editor}>
                <TextInput
                  ref={titleRef}
                  value={title}
                  onChangeText={(nextTitle) => {
                    markUnsynced();
                    setTitle(nextTitle);
                  }}
                  onFocus={() => {
                    setIsEditing(true);
                    setFocusedField('title');
                  }}
                  placeholder="Title"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.titleInput, { color: theme.text }]}
                />

                <TextInput
                  ref={bodyRef}
                  value={body}
                  onChangeText={(nextBody) => {
                    markUnsynced();
                    setBody(nextBody);
                  }}
                  onFocus={() => {
                    setIsEditing(true);
                    setFocusedField('body');
                  }}
                  multiline
                  textAlignVertical="top"
                  placeholder="Note"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.bodyInput, { color: theme.text }]}
                />
              </ScrollView>

              <View style={[styles.categoryPicker, { bottom: keyboardHeight ? keyboardHeight + CategoryKeyboardLift : insets.bottom }]}>
                {selectedBoards.length && noteKind !== 'library' ? (
                  <View style={styles.contextRow}>
                    {selectedBoards.map((board) => (
                      <Pressable
                        key={board.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove board ${board.title}`}
                        onPress={() => {
                          setIsEditing(true);
                          markUnsynced();
                          setSelectedBoardIds((current) => current.filter((boardId) => boardId !== board.id));
                        }}
                        style={({ pressed }) => [
                          styles.contextChip,
                          { borderColor: board.color },
                          pressed && styles.pressed,
                        ]}>
                        <ThemedText type="smallBold" style={[styles.contextChipText, { color: board.color }]}>
                          {board.title}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={styles.todoCategorySheet}>
                    <Animated.View
                      style={[
                        styles.todoCategorySheetRail,
                        {
                          height: CategorySheetRowHeight * (categoryDrawerParents.length + 1),
                          transform: [
                            {
                              translateY: categorySheetProgress.interpolate({
                                inputRange: [0, Math.max(1, categoryDrawerParents.length)],
                                outputRange: [0, -CategorySheetRowHeight * Math.max(1, categoryDrawerParents.length)],
                              }),
                            },
                          ],
                        },
                      ]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isCategorySheetOpen ? 'Hide categories' : 'Show categories'}
                        onPress={() => {
                          setIsAddingCategory(false);
                          setCategoryDraft('');
                          setIsCategorySheetOpen((current) => !current);
                          keepEditorKeyboardOpen();
                        }}
                        style={({ pressed }) => [styles.categorySheetHandle, pressed && styles.pressed]}>
                        <Ionicons name="chevron-up" size={18} color="#555d64" />
                      </Pressable>
                      {noteKind === 'note'
                        ? todoCategoryDrawerParents.map((parentCategoryId) => renderTodoCategoryDrawerRow(parentCategoryId))
                        : renderLibraryCategoryDrawerRow()}
                    </Animated.View>
                  </View>
              </View>
            </>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: NoteSurfaceColor,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
  },
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  compoundActionsPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingBottom: Spacing.two,
  },
  headerSpacer: {
    flex: 1,
    alignItems: 'center',
  },
  saveStatusText: {
    fontSize: 11,
    lineHeight: 14,
    opacity: 0.55,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plainIconButton: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    backgroundColor: 'transparent',
  },
  kindToggleButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d2023',
  },
  compoundActionButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    borderRadius: 10,
    paddingHorizontal: Spacing.two,
    backgroundColor: '#1d2023',
  },
  saveButton: {
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#243b37',
  },
  saveButtonText: {
    color: Colors.light.background,
  },
  disabled: {
    opacity: 0.45,
  },
  editor: {
    flexGrow: 1,
    paddingTop: Spacing.three,
    paddingBottom: 112,
    gap: Spacing.two,
  },
  titleInput: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    paddingVertical: Spacing.two,
  },
  bodyInput: {
    minHeight: 320,
    fontSize: 18,
    lineHeight: 26,
    paddingVertical: Spacing.two,
  },
  titleText: {
    lineHeight: 38,
  },
  emptyTitleText: {
    paddingVertical: Spacing.one,
  },
  bodyText: {
    lineHeight: 26,
    minHeight: 160,
  },
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  contextChip: {
    borderWidth: 1,
    backgroundColor: '#1d2023',
    overflow: 'hidden',
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  contextChipText: {
    fontSize: 12,
    lineHeight: 16,
  },
  categoryPicker: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: NoteSurfaceColor,
  },
  todoCategorySheet: {
    height: CategorySheetRowHeight,
    overflow: 'hidden',
    backgroundColor: NoteSurfaceColor,
  },
  todoCategorySheetRail: {
    backgroundColor: NoteSurfaceColor,
  },
  categorySheetHandle: {
    height: CategorySheetRowHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryCategoryDrawerRow: {
    height: CategorySheetRowHeight,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryDrawerScroller: {
    flex: 1,
    height: CategorySheetRowHeight,
    maxHeight: CategorySheetRowHeight,
  },
  categoryDrawerRow: {
    minHeight: CategorySheetRowHeight,
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  categoryRow: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  categoryChip: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1f22',
  },
  categorySettingsButton: {
    width: 44,
    height: 44,
    marginRight: Spacing.two,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInput: {
    minWidth: 120,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.two,
  },
  selectedChipText: {
    color: Colors.light.background,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
});
