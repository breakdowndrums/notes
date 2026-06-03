import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Animated, BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, NoteSurfaceColor, Spacing } from '@/constants/theme';
import { createNote, fetchNotesByKind } from '@/features/notes/note-api';
import { libraryBoards, sampleBoards, sampleCategories, sampleLibraryNotes } from '@/features/notes/sample-notes';
import type { Note, NoteKind } from '@/features/notes/types';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth/auth-provider';

const CategoryKeyboardLift = 56;
const CategorySheetRowHeight = 48;
const TodoCategoryStorageKeyPrefix = 'notes:todo-categories';
const categoryToneById: Record<string, { backgroundColor: string; textColor: string }> = {
  coding: { backgroundColor: '#123023', textColor: '#9bd7aa' },
  writing: { backgroundColor: '#142840', textColor: '#9dc7f4' },
  work: { backgroundColor: '#342b12', textColor: '#e1c46a' },
};
const defaultCategoryTone = { backgroundColor: '#25282b', textColor: '#c8ced3' };

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

function getCategoryTone(categoryId: string) {
  return categoryToneById[categoryId.split('/')[0].toLowerCase()] ?? defaultCategoryTone;
}

function getLibraryCategoryIds(notes: Note[], extraCategoryIds: string[]) {
  const categoryIds = new Set<string>();

  for (const note of notes) {
    for (const noteCategoryId of note.categoryIds) {
      if (noteCategoryId) {
        categoryIds.add(noteCategoryId);
      }
    }
  }

  for (const extraCategoryId of extraCategoryIds) {
    if (extraCategoryId) {
      categoryIds.add(extraCategoryId);
    }
  }

  return [...categoryIds];
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

type NewNoteComposerProps = {
  forcedKind?: NoteKind;
};

export function NewNoteComposer({ forcedKind = 'note' }: NewNoteComposerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [noteKind, setNoteKind] = useState<NoteKind>(forcedKind);
  const [isBodyFocused, setIsBodyFocused] = useState(false);
  const bodyInputRef = useRef<TextInput>(null);
  const todoCategorySheetProgress = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();
  const { isSupabaseConfigured, user } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const libraryNotesQuery = useQuery({
    queryKey: ['notes', 'library', user?.id],
    queryFn: () => fetchNotesByKind({ kind: 'library' }),
    enabled: isSupabaseConfigured && Boolean(user),
  });
  const boardId = getParam(params.boardId);
  const categoryId = getParam(params.categoryId);
  const boards = noteKind === 'library' ? libraryBoards : sampleBoards;
  const [libraryCategoryIds, setLibraryCategoryIds] = useState<string[]>(categoryId ? [categoryId] : []);
  const [todoCategoryIds, setTodoCategoryIds] = useState<string[]>([]);
  const [categoryNavigationId, setCategoryNavigationId] = useState<string | null>(getParentCategoryId(categoryId) || null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isTodoCategorySheetOpen, setIsTodoCategorySheetOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const allTodoCategories = noteKind === 'note'
    ? [...new Set([...sampleCategories.map((category) => category.id), ...todoCategoryIds])].map((id) => ({
        id,
        title: sampleCategories.find((category) => category.id === id)?.title ?? formatCategoryTitle(id),
        color: sampleCategories.find((category) => category.id === id)?.color ?? '#64748b',
      }))
    : [];
  const libraryNotes = user ? libraryNotesQuery.data ?? [] : sampleLibraryNotes;
  const allLibraryCategoryIds = noteKind === 'library' ? getLibraryCategoryIds(libraryNotes, libraryCategoryIds) : [];
  const returnPath = noteKind === 'library' ? '/library' : '/';
  const selectedBoard = boards.find((board) => board.id === boardId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(categoryId || null);
  const canSave = Boolean(title.trim() || body.trim());
  const todoCategoryDrawerParents = [null, ...(categoryNavigationId ? [categoryNavigationId] : [])];
  const categoryDrawerParents = noteKind === 'note' ? todoCategoryDrawerParents : [null];
  const todoCategoryDrawerIndex = isTodoCategorySheetOpen ? (noteKind === 'note' && categoryNavigationId ? 2 : 1) : 0;

  useEffect(() => {
    const focusTimer = setTimeout(() => {
      bodyInputRef.current?.focus();
    }, 250);

    return () => clearTimeout(focusTimer);
  }, []);

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
    AsyncStorage.getItem(getTodoCategoryStorageKey(user?.id)).then((storedCategories) => {
      setTodoCategoryIds(parseStoredTodoCategories(storedCategories).customCategoryIds);
    });
  }, [user?.id]);

  useEffect(() => {
    Animated.timing(todoCategorySheetProgress, {
      toValue: todoCategoryDrawerIndex,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [todoCategoryDrawerIndex, todoCategorySheetProgress]);

  const saveMutation = useMutation({
    mutationFn: () =>
      createNote({
        kind: noteKind,
        title,
        body,
        boardIds: noteKind === 'library' ? [] : [boardId || 'today'],
        categoryIds: selectedCategoryId ? [selectedCategoryId] : [],
        ownerId: user?.id ?? '',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
      router.replace(returnPath as never);
    },
    onError: (error) => {
      Alert.alert('Could not save note', error instanceof Error ? error.message : 'Try again in a moment.');
    },
  });

  function saveNote() {
    if (!isSupabaseConfigured || !user) {
      Alert.alert('Sign in required', 'Sign in from Account before saving synced notes.');
      return;
    }

    if (!canSave || saveMutation.isPending) {
      return;
    }

    saveMutation.mutate();
  }

  function closeComposer() {
    if (canSave) {
      saveNote();
      return;
    }

    router.replace(returnPath as never);
  }

  function toggleNoteKind() {
    setNoteKind((current) => (current === 'library' ? 'note' : 'library'));
    setSelectedCategoryId(null);
    setCategoryNavigationId(null);
    setIsTodoCategorySheetOpen(false);
    setIsAddingCategory(false);
    setCategoryDraft('');
  }

  function keepEditorKeyboardOpen() {
    if (!keyboardHeight) {
      return;
    }

    const refocusEditor = () => {
      bodyInputRef.current?.focus();
    };

    setTimeout(refocusEditor, 40);
    setTimeout(refocusEditor, 140);
  }

  function createTodoSubcategory() {
    const categorySlug = makeCategoryId(categoryDraft);

    if (!categorySlug) {
      setCategoryDraft('');
      setIsAddingCategory(false);
      return;
    }

    const categoryId = categoryNavigationId ? `${categoryNavigationId}/${categorySlug}` : categorySlug;
    const nextCategoryIds = todoCategoryIds.includes(categoryId) ? todoCategoryIds : [...todoCategoryIds, categoryId];

    setTodoCategoryIds(nextCategoryIds);
    AsyncStorage.setItem(
      getTodoCategoryStorageKey(user?.id),
      JSON.stringify({ customCategoryIds: nextCategoryIds, hiddenCategoryIds: [], categoryLabels: {} }),
    ).catch(() => undefined);
    setSelectedCategoryId(categoryId);
    setCategoryNavigationId(categoryId);
    setCategoryDraft('');
    setIsAddingCategory(false);
    keepEditorKeyboardOpen();
  }

  function stepBackCategorySheet() {
    if (!isTodoCategorySheetOpen) {
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

    setIsTodoCategorySheetOpen(false);
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
                setIsTodoCategorySheetOpen(true);
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
              setIsTodoCategorySheetOpen(true);
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
    return (
      <View style={styles.libraryCategoryDrawerRow}>
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          style={styles.categoryDrawerScroller}
          contentContainerStyle={styles.categoryDrawerRow}>
          {allLibraryCategoryIds.map((categoryId) => {
            const selected = selectedCategoryId === categoryId;

            return (
              <Pressable
                key={categoryId}
                accessibilityRole="button"
                accessibilityLabel={`Toggle category ${categoryId}`}
                accessibilityState={{ selected }}
                onPress={() => {
                  setSelectedCategoryId((current) => (current === categoryId ? null : categoryId));
                  keepEditorKeyboardOpen();
                }}
                style={({ pressed }) => [
                  styles.categoryChip,
                  {
                    backgroundColor: getCategoryTone(categoryId).backgroundColor,
                    borderColor: selected ? getCategoryTone(categoryId).textColor : 'transparent',
                  },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={{ color: getCategoryTone(categoryId).textColor }}>
                  {categoryId}
                </ThemedText>
              </Pressable>
            );
          })}
          {isAddingCategory ? (
            <TextInput
              value={categoryDraft}
              onChangeText={setCategoryDraft}
              onSubmitEditing={() => {
                const nextCategoryId = makeCategoryId(categoryDraft);
                if (nextCategoryId) {
                  setLibraryCategoryIds((current) => (current.includes(nextCategoryId) ? current : [...current, nextCategoryId]));
                  setSelectedCategoryId(nextCategoryId);
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
                setIsTodoCategorySheetOpen(true);
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

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeComposer();
      return true;
    });

    return () => subscription.remove();
  });

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close note composer"
              onPress={closeComposer}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </Pressable>
            <View style={styles.headerSpacer} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={noteKind === 'library' ? 'Switch to todo note' : 'Switch to library note'}
              disabled={saveMutation.isPending}
              onPress={toggleNoteKind}
              style={({ pressed }) => [
                styles.kindToggleButton,
                saveMutation.isPending && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Ionicons name={noteKind === 'library' ? 'albums-outline' : 'checkbox-outline'} size={21} color={theme.text} />
            </Pressable>
          </View>

          {!user ? (
            <View style={[styles.authPanel, { borderColor: theme.backgroundSelected }]}>
              <ThemedText type="smallBold">Sign in to save notes</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Notes persist through Supabase, so create or sign into an account first.
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open account"
                onPress={() => router.replace('/explore')}
                style={({ pressed }) => [styles.accountButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.saveButtonText}>
                  Account
                </ThemedText>
              </Pressable>
            </View>
          ) : null}

          <ScrollView keyboardShouldPersistTaps="handled" onTouchStart={stepBackCategorySheet} contentContainerStyle={styles.editor}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.titleInput,
                !title && isBodyFocused && styles.quietTitleInput,
                { color: !title && isBodyFocused ? theme.textSecondary : theme.text },
              ]}
            />
            <TextInput
              ref={bodyInputRef}
              value={body}
              onChangeText={setBody}
              onFocus={() => setIsBodyFocused(true)}
              onBlur={() => setIsBodyFocused(false)}
              autoFocus
              multiline
              textAlignVertical="top"
              placeholder="Note"
              placeholderTextColor={theme.textSecondary}
              style={[styles.bodyInput, { color: theme.text }]}
            />
          </ScrollView>

          <View style={[styles.categoryPicker, { bottom: keyboardHeight ? keyboardHeight + CategoryKeyboardLift : insets.bottom }]}>
            {selectedBoard && noteKind !== 'library' ? (
              <View style={styles.contextRow}>
                <ThemedText type="smallBold" style={styles.contextChip}>
                  {selectedBoard.title}
                </ThemedText>
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
                        translateY: todoCategorySheetProgress.interpolate({
                          inputRange: [0, Math.max(1, categoryDrawerParents.length)],
                          outputRange: [0, -CategorySheetRowHeight * Math.max(1, categoryDrawerParents.length)],
                        }),
                      },
                    ],
                  },
                ]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isTodoCategorySheetOpen ? 'Hide categories' : 'Show categories'}
                  onPress={() => {
                    setIsAddingCategory(false);
                    setCategoryDraft('');
                    setIsTodoCategorySheetOpen((current) => !current);
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
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

export default function NewNoteScreen() {
  return <NewNoteComposer forcedKind="note" />;
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
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    flex: 1,
  },
  kindToggleButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d2023',
  },
  saveButtonText: {
    color: Colors.light.background,
  },
  disabled: {
    opacity: 0.45,
  },
  authPanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  accountButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#243b37',
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
  quietTitleInput: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '500',
    opacity: 0.55,
  },
  bodyInput: {
    minHeight: 320,
    fontSize: 18,
    lineHeight: 26,
    paddingVertical: Spacing.two,
  },
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  contextChip: {
    color: Colors.light.background,
    backgroundColor: '#243b37',
    overflow: 'hidden',
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
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
    borderColor: 'transparent',
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
  pressed: {
    opacity: 0.72,
  },
});
