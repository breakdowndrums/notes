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
import { deleteNote, fetchNotesByKind, updateNote } from '@/features/notes/note-api';
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

type StoredTodoCategories = {
  customCategoryIds: string[];
  hiddenCategoryIds: string[];
  categoryLabels: Record<string, string>;
};

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
  const [categoryDraft, setCategoryDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [focusedField, setFocusedField] = useState<'title' | 'body' | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [savedTitle, setSavedTitle] = useState('');
  const [savedBody, setSavedBody] = useState('');
  const [savedBoardIds, setSavedBoardIds] = useState<string[]>([]);
  const [savedCategoryId, setSavedCategoryId] = useState<string | null>(null);
  const [savedKind, setSavedKind] = useState<NoteKind>(initialNoteKind);
  const selectedBoards = boards.filter((board) => selectedBoardIds.includes(board.id));
  const allTodoCategories = noteKind === 'note' ? getTodoCategories(notes, todoCategoryIds) : [];
  const allLibraryCategoryIds = noteKind === 'library' ? getLibraryCategoryIds(notes, libraryCategoryIds) : [];
  const canSave = Boolean(title.trim() || body.trim());
  const saveMutation = useMutation({
    mutationFn: () =>
      updateNote({
        kind: noteKind,
        id: noteId,
        title,
        body,
        boardIds: noteKind === 'library' ? [] : selectedBoardIds,
        categoryIds: selectedCategoryId ? [selectedCategoryId] : [],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      setSavedTitle(title);
      setSavedBody(body);
      setSavedBoardIds(noteKind === 'library' ? [] : selectedBoardIds);
      setSavedCategoryId(selectedCategoryId);
      setSavedKind(noteKind);
      setIsEditing(false);
      setFocusedField(null);
    },
    onError: (error) => {
      Alert.alert('Could not save note', error instanceof Error ? error.message : 'Try again in a moment.');
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteNote({ id: noteId }),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: ['notes', noteKind, user?.id] });
      queryClient.setQueryData<Note[]>(['notes', noteKind, user?.id], (currentNotes) =>
        currentNotes?.filter((currentNote) => currentNote.id !== noteId) ?? [],
      );
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      router.replace(returnPath as never);
    },
    onError: (error) => {
      Alert.alert('Could not delete note', error instanceof Error ? error.message : 'Try again in a moment.');
    },
  });

  useEffect(() => {
    if (note && loadedNoteId !== note.id) {
      setTitle(note.title);
      setBody(note.body);
      setSelectedBoardIds(noteKind === 'library' ? [] : note.boardIds);
      setSelectedCategoryId(note.categoryIds[0] ?? null);
      setCategoryNavigationId(noteKind === 'note' ? getParentCategoryId(note.categoryIds[0] ?? null) : null);
      setLibraryCategoryIds(noteKind === 'library' ? note.categoryIds.filter(Boolean) : []);
      setSavedTitle(note.title);
      setSavedBody(note.body);
      setSavedBoardIds(noteKind === 'library' ? [] : note.boardIds);
      setSavedCategoryId(note.categoryIds[0] ?? null);
      setSavedKind(noteKind);
      setLoadedNoteId(note.id);
    }
  }, [loadedNoteId, note, noteKind]);

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

  async function persistNote() {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in from Account before editing synced notes.');
      return false;
    }

    if (!note || !canSave || saveMutation.isPending) {
      return false;
    }

    try {
      await saveMutation.mutateAsync();
      return true;
    } catch {
      return false;
    }
  }

  async function goBack() {
    if ((!note && loadedNoteId !== noteId) || !user) {
      router.replace(returnPath as never);
      return;
    }

    const hasChanges =
      title !== savedTitle ||
      body !== savedBody ||
      noteKind !== savedKind ||
      selectedCategoryId !== savedCategoryId ||
      selectedBoardIds.join('|') !== savedBoardIds.join('|');

    if (hasChanges && canSave) {
      const saved = await persistNote();

      if (!saved) {
        return;
      }
    }

    router.replace(returnPath as never);
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

  function createTodoSubcategory() {
    const categorySlug = makeCategoryId(categoryDraft);

    if (!categorySlug) {
      setCategoryDraft('');
      setIsAddingCategory(false);
      return;
    }

    const categoryId = categoryNavigationId ? `${categoryNavigationId}/${categorySlug}` : categorySlug;

    setIsEditing(true);
    setTodoCategoryIds((current) => (current.includes(categoryId) ? current : [...current, categoryId]));
    setSelectedCategoryId(categoryId);
    setCategoryNavigationId(categoryId);
    setCategoryDraft('');
    setIsAddingCategory(false);
  }

  function stepBackCategorySheet() {
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
            <View style={styles.headerSpacer} />
            <View style={styles.headerActions}>
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
                  onChangeText={setTitle}
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
                  onChangeText={setBody}
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
  headerSpacer: {
    flex: 1,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
