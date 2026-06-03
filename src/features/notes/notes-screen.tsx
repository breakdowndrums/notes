import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import {
  Alert,
  Animated,
  AppState,
  Keyboard,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  ToastAndroid,
  useWindowDimensions,
  View,
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  clampLibraryDayStartHour,
  DefaultLibraryDayStartHour,
  LibraryDayStartHourStorageKey,
  millisecondsUntilNextLibraryDay,
  startOfLibraryDay,
} from '@/constants/preferences';
import { Colors, MaxContentWidth, NoteSurfaceColor, Spacing } from '@/constants/theme';
import {
  deleteLibraryCategory,
  fetchNotesByKind,
  renameLibraryCategory,
  reorderNotes,
  updateNote,
  updateNoteDone,
} from '@/features/notes/note-api';
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
import { useCallback, useEffect, useRef, useState } from 'react';

const categoryToneById: Record<string, { backgroundColor: string; textColor: string }> = {
  coding: { backgroundColor: '#123023', textColor: '#9bd7aa' },
  writing: { backgroundColor: '#142840', textColor: '#9dc7f4' },
  work: { backgroundColor: '#342b12', textColor: '#e1c46a' },
};

const defaultCategoryTone = { backgroundColor: '#25282b', textColor: '#c8ced3' };
const boardSymbolById: Record<string, string> = {
  today: 'T',
  tomorrow: '1',
  yesterday: 'Y',
  'this-week': '7',
};
const boardPriorityById: Record<string, number> = {
  today: 1,
  tomorrow: 2,
  yesterday: 2,
  'this-week': 3,
};
const LastSectionStorageKey = 'notes:last-section';
const LibraryDoneStorageKeyPrefix = 'notes:library-done';
const TodoCategoryStorageKeyPrefix = 'notes:todo-categories';
const CategorySheetRowHeight = 48;
const SettingsIconPath =
  'M0 0 C9.67730533 8.69706104 12.03911982 19.73545397 13.31640625 32.11328125 C15.13973765 48.21116211 20.97451351 60.03353001 33.359375 70.5859375 C44.13137613 78.33851407 57.08302487 81.75429847 70.23046875 80.1640625 C78.02763911 78.86246808 85.28458034 75.84515711 92.2890625 72.2265625 C101.21369558 67.91759017 111.93182405 67.99176033 121.44921875 70.2890625 C146.13115291 79.61194416 160.50939789 112.91888705 170.9375 135.44140625 C176.33387188 147.56642138 180.22917699 160.92676952 175.3125 174.00390625 C170.65038804 183.63893763 163.7667427 189.90046089 155 195.75390625 C144.1603466 203.28738312 136.55032732 214.37726966 133.9375 227.44140625 C131.67707924 240.98198497 134.10166939 254.31758326 141.5390625 265.9453125 C146.68556046 272.88955975 152.85918533 278.08590489 160 282.87890625 C168.22634884 288.54004954 175.05458919 296.36434656 176.9375 306.44140625 C178.29059133 324.34087151 172.1776632 337.92592031 163.9375 353.44140625 C163.54900879 354.1797168 163.16051758 354.91802734 162.76025391 355.67871094 C157.20020395 366.18826036 151.1310203 375.97624796 143.9375 385.44140625 C143.23625 386.39015625 142.535 387.33890625 141.8125 388.31640625 C135.54145325 396.54715511 128.27319273 403.10543529 117.9375 405.44140625 C106.79568584 406.79086384 98.00053825 405.48659798 87.9375 400.44140625 C78.24092387 396.28836811 78.24092387 396.28836811 67.9375 394.44140625 C66.761875 394.35890625 65.58625 394.27640625 64.375 394.19140625 C50.76561842 394.48040856 38.03361083 399.3326591 28.0625 408.62890625 C18.18493037 419.30539696 14.29881187 430.69497738 13.0625 444.81640625 C11.86780558 457.791695 8.03893577 467.72309015 -2.0625 476.44140625 C-22.7813608 491.89885287 -65.00820036 487.64114843 -89.375 484.31640625 C-100.14216495 482.57073029 -110.45054743 478.50536169 -117.0625 469.44140625 C-122.16975336 461.38355872 -124.06973035 453.83367643 -125.0625 444.44140625 C-126.97866837 427.80827467 -132.60908931 415.26714393 -145.484375 404.296875 C-156.25637613 396.54429843 -169.20802487 393.12851403 -182.35546875 394.71875 C-190.15263911 396.02034442 -197.40958034 399.03765539 -204.4140625 402.65625 C-213.33869558 406.96522233 -224.05682405 406.89105217 -233.57421875 404.59375 C-256.70181544 395.85797404 -271.42935052 364.99748932 -281.1328125 343.9375 C-287.07572104 330.58674417 -291.87344553 318.10755843 -288.30859375 303.3125 C-287.37086697 300.90382926 -286.32730859 298.69338252 -285.0625 296.44140625 C-284.505625 295.41015625 -283.94875 294.37890625 -283.375 293.31640625 C-278.73691665 287.55014047 -273.13795616 283.08957199 -267 279.00390625 C-256.1925811 271.56438068 -248.65513354 260.40457394 -246.0625 247.44140625 C-243.80207924 233.90082753 -246.22666939 220.56522924 -253.6640625 208.9375 C-258.65618738 202.20155068 -264.59613187 196.96422632 -271.625 192.44140625 C-280.12578854 186.88151013 -285.39996153 180.34368388 -288.671875 170.6328125 C-291.94003347 152.29844349 -284.43367656 137.20357855 -276.0625 121.44140625 C-275.67400879 120.7030957 -275.28551758 119.96478516 -274.88525391 119.20410156 C-269.32520395 108.69455214 -263.2560203 98.90656454 -256.0625 89.44140625 C-255.36125 88.49265625 -254.66 87.54390625 -253.9375 86.56640625 C-247.66645325 78.33565739 -240.39819273 71.77737721 -230.0625 69.44140625 C-218.92068584 68.09194866 -210.12553825 69.39621452 -200.0625 74.44140625 C-190.36592387 78.59444439 -190.36592387 78.59444439 -180.0625 80.44140625 C-178.886875 80.52390625 -177.71125 80.60640625 -176.5 80.69140625 C-162.89061842 80.40240394 -150.15861083 75.5501534 -140.1875 66.25390625 C-130.30993037 55.57741554 -126.42381187 44.18783512 -125.1875 30.06640625 C-123.99280558 17.0911175 -120.16393577 7.15972235 -110.0625 -1.55859375 C-87.19662884 -18.61783202 -22.45762987 -16.97082257 0 0 Z M-112.75 190.50390625 C-125.33181677 206.69341242 -131.09318605 226.05295569 -129.0625 246.44140625 C-126.39763762 266.28907921 -115.88883799 283.90139492 -100.3125 296.31640625 C-83.25926798 308.31764586 -63.52319082 313.28195097 -42.8515625 309.8203125 C-23.46082692 305.87331695 -6.22395904 294.83607686 4.9375 278.44140625 C15.78789622 260.72391482 20.2699646 240.77694551 15.4375 220.31640625 C10.27004982 201.07498702 -1.12094002 185.03524249 -18.0625 174.44140625 C-50.06493627 156.37420805 -88.46598547 162.91594416 -112.75 190.50390625 Z';

type StoredTodoCategories = {
  customCategoryIds: string[];
  hiddenCategoryIds: string[];
  categoryLabels: Record<string, string>;
};

function getLibraryDoneStorageKey(userId?: string) {
  return `${LibraryDoneStorageKeyPrefix}:${userId ?? 'local'}`;
}

function getTodoCategoryStorageKey(userId?: string) {
  return `${TodoCategoryStorageKeyPrefix}:${userId ?? 'local'}`;
}

function SettingsIcon({ color = '#000000', size = 23 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Path d={SettingsIconPath} fill={color} transform="translate(312.0625,18.55859375)" />
    </Svg>
  );
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

function getCategoryTone(categoryId: string | null) {
  if (!categoryId) {
    return defaultCategoryTone;
  }

  return categoryToneById[categoryId.split('/')[0].toLowerCase()] ?? defaultCategoryTone;
}

function getBoardPriority(note: Note) {
  if (!note.boardIds.length) {
    return 0;
  }

  return Math.min(...note.boardIds.map((boardId) => boardPriorityById[boardId] ?? 4));
}

function getColumnCount(width: number) {
  if (width >= 820) {
    return 3;
  }

  if (width >= 520) {
    return 2;
  }

  return 1;
}

function findCategories(note: Note, categories = sampleCategories) {
  return categories.filter((category) => note.categoryIds.includes(category.id));
}

function findBoards(note: Note, boards = sampleBoards) {
  return boards.filter((board) => note.boardIds.includes(board.id));
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

function doesCategoryMatchFilter(categoryIds: string[], selectedCategoryId: string | null) {
  if (!selectedCategoryId) {
    return true;
  }

  const childPrefix = `${selectedCategoryId}/`;

  return categoryIds.some((categoryId) => categoryId === selectedCategoryId || categoryId.startsWith(childPrefix));
}

function isCategoryOrDescendant(categoryId: string, parentCategoryId: string) {
  return categoryId === parentCategoryId || categoryId.startsWith(`${parentCategoryId}/`);
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

function getLibraryCreatedDate(note: Note) {
  const createdTime = Date.parse(note.createdAt);
  const positionTime = note.position;
  const positionTimeInMilliseconds = positionTime < Date.UTC(2020, 0, 1) ? positionTime * 1000 : positionTime;
  const plausiblePositionTime =
    Number.isFinite(positionTimeInMilliseconds) &&
    positionTimeInMilliseconds > Date.UTC(2020, 0, 1) &&
    positionTimeInMilliseconds < Date.now() + 24 * 60 * 60 * 1000
      ? positionTimeInMilliseconds
      : null;
  const plausibleCreatedTime = Number.isFinite(createdTime) ? createdTime : null;
  const fallbackTime = plausibleCreatedTime ?? plausiblePositionTime ?? Date.now();

  if (plausibleCreatedTime && plausiblePositionTime) {
    return new Date(Math.min(plausibleCreatedTime, plausiblePositionTime));
  }

  return new Date(fallbackTime);
}

function getLibraryBoardId(note: Note, now = new Date(), dayStartHour = DefaultLibraryDayStartHour) {
  const createdDate = getLibraryCreatedDate(note);
  const today = startOfLibraryDay(now, dayStartHour);
  const yesterday = startOfLibraryDay(now, dayStartHour);
  const weekAgo = startOfLibraryDay(now, dayStartHour);

  yesterday.setDate(today.getDate() - 1);
  weekAgo.setDate(today.getDate() - 6);

  if (createdDate >= today) {
    return 'today';
  }

  if (createdDate >= yesterday) {
    return 'yesterday';
  }

  if (createdDate >= weekAgo) {
    return 'this-week';
  }

  return null;
}

function isNoteInLibraryBoard(note: Note, boardId: string | null, now = new Date(), dayStartHour = DefaultLibraryDayStartHour) {
  if (!boardId) {
    return true;
  }

  const libraryBoardId = getLibraryBoardId(note, now, dayStartHour);

  return libraryBoardId === boardId;
}

function getLibraryCategories(notes: Note[], customCategoryIds: string[]) {
  const categoryIds = new Set<string>();

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

  return [...categoryIds].map((categoryId) => ({
    id: categoryId,
    title: formatCategoryTitle(categoryId),
    color: '#64748b',
  }));
}

function getTodoCategories(notes: Note[], customCategoryIds: string[], hiddenCategoryIds: string[], categoryLabels: Record<string, string>) {
  const hiddenIds = new Set(hiddenCategoryIds);
  const categoryIds = new Set(sampleCategories.map((category) => category.id).filter((categoryId) => !hiddenIds.has(categoryId)));

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
      title: categoryLabels[categoryId] ?? rootCategory?.title ?? formatCategoryTitle(categoryId),
      color: rootCategory?.color ?? '#64748b',
    };
  });
}

function getCopyText(note: Note) {
  return [note.title.trim(), note.body.trim()].filter(Boolean).join('\n\n');
}

function getFirstUrl(value: string) {
  return value.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
}

function splitTextAtWord(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return { head: value, tail: '' };
  }

  const nextSpaceIndex = value.lastIndexOf(' ', maxLength);
  const splitIndex = nextSpaceIndex > maxLength * 0.55 ? nextSpaceIndex : maxLength;

  return {
    head: value.slice(0, splitIndex).trim(),
    tail: value.slice(splitIndex).trim(),
  };
}

function FilterChip({
  label,
  toneId,
  selected,
  accessibilityLabel,
  onPress,
  onLongPress,
}: {
  label: string;
  toneId: string | null;
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const tone = getCategoryTone(toneId);
  const isAllCategories = !toneId;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={420}
      style={({ pressed }) => [
        styles.filterChip,
        {
          backgroundColor: isAllCategories ? '#1c1f22' : tone.backgroundColor,
          borderColor: selected && !isAllCategories ? tone.textColor : 'transparent',
          opacity: pressed ? 0.78 : 1,
        },
      ]}>
      <ThemedText type="smallBold" style={{ color: isAllCategories ? '#8f989f' : tone.textColor }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function MetadataChip({ label, toneId }: { label: string; toneId: string }) {
  const tone = getCategoryTone(toneId);

  return (
    <View style={[styles.metadataChip, { backgroundColor: tone.backgroundColor }]}>
      <ThemedText type="smallBold" style={[styles.metadataChipText, { color: tone.textColor }]}>
        {label}
      </ThemedText>
    </View>
  );
}

function NoteTile({
  note,
  width,
  active,
  itemGap,
  showBoardStatus,
  showUnboardedTone = false,
  showActionBar = false,
  onPress,
  onLongPress,
  onCopy,
  onOpenChatGPT,
  onOpenUrl,
  onToggleDone,
  onMoveToPreviousBoard,
  onMoveToNextBoard,
  boards,
  categories,
  showBoardActions = true,
}: {
  note: Note;
  width: number;
  active: boolean;
  itemGap: number;
  showBoardStatus: boolean;
  showUnboardedTone?: boolean;
  showActionBar?: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onCopy?: () => void;
  onOpenChatGPT?: () => void;
  onOpenUrl?: () => void;
  onToggleDone?: () => void;
  onMoveToPreviousBoard: () => void;
  onMoveToNextBoard: () => void;
  boards: typeof sampleBoards;
  categories: typeof sampleCategories;
  showBoardActions?: boolean;
}) {
  const theme = useTheme();
  const assignedCategories = findCategories(note, categories);
  const assignedBoards = findBoards(note, boards);
  const isUnboarded = !note.boardIds.length;
  const textWidth = width - Spacing.two * 2;
  const title = note.title.trim();
  const body = note.body.trim();
  const firstUrl = getFirstUrl(body);
  const bodyWithoutDuplicateTitle = body.startsWith(`${title}\n`)
    ? body.slice(title.length).trim()
    : body;
  const shouldShowBody = Boolean(bodyWithoutDuplicateTitle && bodyWithoutDuplicateTitle !== title);
  const isBodyOnly = !title && shouldShowBody;
  const reservedHeaderWidth = (showBoardStatus && assignedBoards.length ? 18 * assignedBoards.length + Spacing.two : 0) + (showBoardActions ? 64 : 0);
  const bodyOnlyHeaderCharacters = Math.max(24, Math.floor((textWidth - reservedHeaderWidth) / 8.5) * 2);
  const bodyOnlyPreview = isBodyOnly ? splitTextAtWord(bodyWithoutDuplicateTitle, bodyOnlyHeaderCharacters) : { head: '', tail: '' };
  const isQuiet = Boolean(note.done);
  const textColor = showActionBar ? '#8f969d' : isQuiet ? '#5f666d' : theme.text;
  const bodyTextColor = showActionBar ? '#777f87' : isQuiet ? '#515960' : theme.textSecondary;

  return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open note ${note.title || note.body || 'Untitled note'}`}
        onPress={active ? undefined : onPress}
        onLongPress={onLongPress}
        delayLongPress={320}
        style={({ pressed }) => [
          styles.noteTile,
          {
            width,
            backgroundColor: isQuiet ? '#111315' : showUnboardedTone && showBoardStatus && isUnboarded ? '#2b3035' : NoteSurfaceColor,
            borderColor: active ? '#4f7f74' : theme.backgroundSelected,
            elevation: active ? 10 : 0,
            marginBottom: itemGap,
            opacity: isQuiet ? 0.62 : pressed && !active ? 0.75 : 1,
          },
        ]}>
        <View style={[styles.cardHeaderRow, { width: textWidth }]}>
          <View style={styles.cardTitleButton}>
            {title ? (
              <ThemedText type="smallBold" style={[styles.noteTitle, { color: textColor }]}>
                {title}
              </ThemedText>
            ) : isBodyOnly ? (
              <ThemedText type="smallBold" style={[styles.noteTitle, { color: bodyTextColor }]} numberOfLines={2}>
                {bodyOnlyPreview.head}
              </ThemedText>
            ) : (
              <View style={styles.emptyCardTitle} />
            )}
          </View>
          {showBoardStatus && assignedBoards.length ? (
            <View style={styles.boardStatusBadges}>
              {assignedBoards.map((board) => (
                <View key={board.id} style={styles.boardStatusBadge}>
                  <ThemedText type="smallBold" style={styles.boardStatusBadgeText}>
                    {boardSymbolById[board.id] ?? board.title.slice(0, 1)}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
          {showBoardActions ? (
            <View style={styles.cardBoardActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Move note to previous board"
                onPress={onMoveToPreviousBoard}
                style={({ pressed }) => [styles.cardBoardButton, pressed && styles.pressed]}>
                <Ionicons name="chevron-back" size={17} color={theme.textSecondary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Move note to next board"
                onPress={onMoveToNextBoard}
                style={({ pressed }) => [styles.cardBoardButton, pressed && styles.pressed]}>
                <Ionicons name="chevron-forward" size={17} color={theme.textSecondary} />
              </Pressable>
            </View>
          ) : null}
        </View>
        {shouldShowBody && !isBodyOnly ? (
          <View style={styles.cardBodyButton}>
            <ThemedText type="small" style={[styles.noteBody, { color: bodyTextColor }]} numberOfLines={3}>
              {bodyWithoutDuplicateTitle}
            </ThemedText>
          </View>
        ) : null}
        {bodyOnlyPreview.tail ? (
          <View style={styles.cardBodyButton}>
            <ThemedText type="smallBold" style={[styles.noteTitle, { color: bodyTextColor }]} numberOfLines={1}>
              {bodyOnlyPreview.tail}
            </ThemedText>
          </View>
        ) : null}
        {showActionBar ? (
          <View style={styles.libraryActionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy note text"
              onPress={onCopy}
              style={({ pressed }) => [styles.libraryActionButton, pressed && styles.pressed]}>
              <Ionicons name="copy-outline" size={17} color={theme.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open note in ChatGPT"
              onPress={onOpenChatGPT}
              style={({ pressed }) => [styles.libraryActionButton, pressed && styles.pressed]}>
              <Ionicons name="chatbubble-ellipses-outline" size={17} color={theme.text} />
            </Pressable>
            {firstUrl ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open link in browser"
                onPress={onOpenUrl}
                style={({ pressed }) => [styles.libraryActionButton, pressed && styles.pressed]}>
                <Ionicons name="open-outline" size={17} color={theme.text} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={note.done ? 'Mark note as not done' : 'Mark note as done'}
              onPress={onToggleDone}
              style={({ pressed }) => [styles.libraryActionButton, note.done && styles.libraryActionButtonSelected, pressed && styles.pressed]}>
              <Ionicons name={note.done ? 'refresh-outline' : 'checkmark-done-outline'} size={17} color={theme.text} />
            </Pressable>
          </View>
        ) : null}
        {assignedCategories.length ? (
          <View style={styles.metadataRow}>
            {assignedCategories.slice(0, 1).map((category) => (
              <MetadataChip key={category.id} label={category.title} toneId={category.id} />
            ))}
          </View>
        ) : null}
      </Pressable>
  );
}

type NotesScreenProps = {
  noteKind?: NoteKind;
};

export default function NotesScreen({ noteKind = 'note' }: NotesScreenProps) {
  const isLibrary = noteKind === 'library';
  const boards = isLibrary ? libraryBoards : sampleBoards;
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>('today');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [customTodoCategoryIds, setCustomTodoCategoryIds] = useState<string[]>([]);
  const [hiddenTodoCategoryIds, setHiddenTodoCategoryIds] = useState<string[]>([]);
  const [todoCategoryLabels, setTodoCategoryLabels] = useState<Record<string, string>>({});
  const [customLibraryCategoryIds, setCustomLibraryCategoryIds] = useState<string[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [activeActionNoteId, setActiveActionNoteId] = useState<string | null>(null);
  const [doneOverrides, setDoneOverrides] = useState<Record<string, boolean>>({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [activeDragPageKey, setActiveDragPageKey] = useState<string | null>(null);
  const [dragOrders, setDragOrders] = useState<Record<string, string[]>>({});
  const [libraryClock, setLibraryClock] = useState(() => new Date());
  const [libraryDayStartHour, setLibraryDayStartHour] = useState(DefaultLibraryDayStartHour);
  const boardPagerRef = useRef<ScrollView>(null);
  const dragOrdersRef = useRef<Record<string, string[]>>({});
  const pendingRenameLabelRef = useRef('');
  const categorySheetProgress = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSupabaseConfigured, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const theme = useTheme();
  const notesQuery = useQuery({
    queryKey: ['notes', noteKind, user?.id],
    queryFn: () => fetchNotesByKind({ kind: noteKind }),
    enabled: isSupabaseConfigured && Boolean(user),
  });

  useEffect(() => {
    AsyncStorage.setItem(LastSectionStorageKey, noteKind).catch(() => undefined);
  }, [noteKind]);

  useEffect(() => {
    if (isLibrary) {
      return;
    }

    AsyncStorage.getItem(getTodoCategoryStorageKey(user?.id)).then((storedCategoryIds) => {
      const parsedCategories = parseStoredTodoCategories(storedCategoryIds);

      setCustomTodoCategoryIds(parsedCategories.customCategoryIds);
      setHiddenTodoCategoryIds(parsedCategories.hiddenCategoryIds);
      setTodoCategoryLabels(parsedCategories.categoryLabels);
    });
  }, [isLibrary, user?.id]);

  useEffect(() => {
    if (isLibrary) {
      return;
    }

    AsyncStorage.setItem(
      getTodoCategoryStorageKey(user?.id),
      JSON.stringify({
        customCategoryIds: customTodoCategoryIds,
        hiddenCategoryIds: hiddenTodoCategoryIds,
        categoryLabels: todoCategoryLabels,
      }),
    ).catch(() => undefined);
  }, [customTodoCategoryIds, hiddenTodoCategoryIds, isLibrary, todoCategoryLabels, user?.id]);

  useEffect(() => {
    if (!isLibrary) {
      return;
    }

    AsyncStorage.getItem(getLibraryDoneStorageKey(user?.id)).then((storedDoneOverrides) => {
      if (!storedDoneOverrides) {
        return;
      }

      try {
        setDoneOverrides(JSON.parse(storedDoneOverrides) as Record<string, boolean>);
      } catch {
        setDoneOverrides({});
      }
    });
  }, [isLibrary, user?.id]);

  useEffect(() => {
    if (!isLibrary) {
      return;
    }

    AsyncStorage.setItem(getLibraryDoneStorageKey(user?.id), JSON.stringify(doneOverrides)).catch(() => undefined);
  }, [doneOverrides, isLibrary, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!isLibrary) {
        return undefined;
      }

      let isActive = true;

      AsyncStorage.getItem(LibraryDayStartHourStorageKey).then((storedHour) => {
        if (!isActive || storedHour === null) {
          return;
        }

        setLibraryDayStartHour(clampLibraryDayStartHour(Number(storedHour)));
        setLibraryClock(new Date());
      });

      return () => {
        isActive = false;
      };
    }, [isLibrary]),
  );

  useEffect(() => {
    if (!isLibrary) {
      return;
    }

    let midnightTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshLibraryDay = () => setLibraryClock(new Date());
    const scheduleMidnightRefresh = () => {
      midnightTimer = setTimeout(() => {
        refreshLibraryDay();
        scheduleMidnightRefresh();
      }, millisecondsUntilNextLibraryDay(new Date(), libraryDayStartHour) + 1000);
    };

    refreshLibraryDay();
    scheduleMidnightRefresh();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshLibraryDay();
      }
    });

    return () => {
      if (midnightTimer) {
        clearTimeout(midnightTimer);
      }
      appStateSubscription.remove();
    };
  }, [isLibrary, libraryDayStartHour]);

  useFocusEffect(
    useCallback(() => {
      if (isSupabaseConfigured && user) {
        notesQuery.refetch();
      }
    }, [isSupabaseConfigured, notesQuery, user]),
  );

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

  const reorderMutation = useMutation({
    mutationFn: reorderNotes,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (error) => {
      Alert.alert('Could not move note', error instanceof Error ? error.message : 'Try again in a moment.');
    },
  });
  const moveBoardMutation = useMutation({
    mutationFn: ({ note, boardId }: { note: Note; boardId: string }) =>
      updateNote({
        kind: noteKind,
        id: note.id,
        title: note.title,
        body: note.body,
        boardIds: [boardId],
        categoryIds: note.categoryIds.slice(0, 1),
      }),
    onMutate: async ({ note, boardId }) => {
      await queryClient.cancelQueries({ queryKey: ['notes', noteKind, user?.id] });
      const previousNotes = queryClient.getQueryData<Note[]>(['notes', noteKind, user?.id]);

      queryClient.setQueryData<Note[]>(['notes', noteKind, user?.id], (currentNotes) =>
        currentNotes?.map((currentNote) =>
          currentNote.id === note.id ? { ...currentNote, boardIds: [boardId] } : currentNote,
        ) ?? [],
      );

      return { previousNotes };
    },
    onError: (error, _variables, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(['notes', noteKind, user?.id], context.previousNotes);
      }

      Alert.alert('Could not move note', error instanceof Error ? error.message : 'Try again in a moment.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
  const renameCategoryMutation = useMutation({
    mutationFn: renameLibraryCategory,
    onSuccess: async (_data, variables) => {
      setCustomLibraryCategoryIds((current) => {
        const nextIds = current.map((categoryId) => replaceCategoryPath(categoryId, variables.fromCategoryId, variables.toCategoryId));

        return [...new Set(nextIds)];
      });
      setCustomTodoCategoryIds((current) => {
        const nextIds = current.map((categoryId) => replaceCategoryPath(categoryId, variables.fromCategoryId, variables.toCategoryId));

        return [...new Set([...nextIds, variables.toCategoryId])];
      });
      setTodoCategoryLabels((current) => {
        const nextLabels = Object.fromEntries(
          Object.entries(current).map(([categoryId, label]) => [
            replaceCategoryPath(categoryId, variables.fromCategoryId, variables.toCategoryId),
            label,
          ]),
        );

        nextLabels[variables.toCategoryId] = pendingRenameLabelRef.current || nextLabels[variables.toCategoryId] || formatCategoryTitle(variables.toCategoryId);
        delete nextLabels[variables.fromCategoryId];

        return nextLabels;
      });
      pendingRenameLabelRef.current = '';
      setHiddenTodoCategoryIds((current) => {
        if (!sampleCategories.some((category) => isCategoryOrDescendant(category.id, variables.fromCategoryId))) {
          return current;
        }

        return [...new Set([...current, variables.fromCategoryId])];
      });
      setSelectedCategoryId((current) => (current ? replaceCategoryPath(current, variables.fromCategoryId, variables.toCategoryId) : current));
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (error) => {
      pendingRenameLabelRef.current = '';
      Alert.alert('Could not rename category', error instanceof Error ? error.message : 'Try again in a moment.');
    },
  });
  const deleteCategoryMutation = useMutation({
    mutationFn: deleteLibraryCategory,
    onSuccess: async (_data, variables) => {
      setCustomLibraryCategoryIds((current) => current.filter((categoryId) => !isCategoryOrDescendant(categoryId, variables.categoryId)));
      setCustomTodoCategoryIds((current) => current.filter((categoryId) => !isCategoryOrDescendant(categoryId, variables.categoryId)));
      setTodoCategoryLabels((current) => Object.fromEntries(
        Object.entries(current).filter(([categoryId]) => !isCategoryOrDescendant(categoryId, variables.categoryId)),
      ));
      setHiddenTodoCategoryIds((current) => {
        if (!sampleCategories.some((category) => isCategoryOrDescendant(category.id, variables.categoryId))) {
          return current;
        }

        return [...new Set([...current, variables.categoryId])];
      });
      setSelectedCategoryId((current) => (current && isCategoryOrDescendant(current, variables.categoryId) ? getParentCategoryId(variables.categoryId) : current));
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (error) => {
      Alert.alert('Could not delete category', error instanceof Error ? error.message : 'Try again in a moment.');
    },
  });
  const doneMutation = useMutation({
    mutationFn: updateNoteDone,
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: ['notes', noteKind, user?.id] });
      const previousNotes = queryClient.getQueryData<Note[]>(['notes', noteKind, user?.id]);

      queryClient.setQueryData<Note[]>(['notes', noteKind, user?.id], (currentNotes) =>
        currentNotes?.map((note) => (note.id === id ? { ...note, done } : note)) ?? [],
      );

      return { previousNotes };
    },
    onError: (error, _variables, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(['notes', noteKind, user?.id], context.previousNotes);
      }

      Alert.alert('Could not update note', error instanceof Error ? error.message : 'Try again in a moment.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const screenSidePadding = Spacing.three;
  const gridSidePadding = isLibrary ? Spacing.two : screenSidePadding;
  const horizontalPadding = gridSidePadding * 2;
  const availableWidth = Math.min(viewportWidth, MaxContentWidth) - horizontalPadding;
  const columnCount = getColumnCount(availableWidth);
  const gap = isLibrary ? Spacing.two : Spacing.three;
  const noteGridWidth = availableWidth;
  const noteColumnCount = isLibrary ? Math.max(2, columnCount) : columnCount;
  const tileWidth = (noteGridWidth - gap * (noteColumnCount - 1)) / noteColumnCount;
  const allBoardsPage = { id: null, title: 'All', color: '#243b37' };
  const boardPages = isLibrary ? [allBoardsPage, ...boards].reverse() : [allBoardsPage, ...boards];
  const selectedBoardIndex = Math.max(
    0,
    boardPages.findIndex((board) => board.id === selectedBoardId),
  );
  const selectedBoard = boardPages[selectedBoardIndex] ?? boardPages[0];
  const notes = (user ? notesQuery.data ?? [] : isLibrary ? sampleLibraryNotes : sampleNotes)
    .filter((note) => note.kind === noteKind)
    .map((note) => (isLibrary && note.id in doneOverrides ? { ...note, done: doneOverrides[note.id] } : note));
  const categories = isLibrary ? getLibraryCategories(notes, customLibraryCategoryIds) : getTodoCategories(notes, customTodoCategoryIds, hiddenTodoCategoryIds, todoCategoryLabels);
  const selectedCategoryPath = selectedCategoryId ? selectedCategoryId.split('/').map((_part, index, parts) => parts.slice(0, index + 1).join('/')) : [];
  const categoryRowParents = isLibrary ? [null] : [null, ...selectedCategoryPath];
  const contentBottomPadding = Spacing.three;
  const isEditingCategoryLabel = isAddingCategory || Boolean(renamingCategoryId);
  const isCategorySheetExpanded = isCategorySheetOpen || isEditingCategoryLabel;
  const categorySheetHeight = CategorySheetRowHeight;
  const bottomControlsOffset = isEditingCategoryLabel ? keyboardHeight : 0;
  const shouldShowBottomBackLayer = isCategorySheetExpanded;

  useEffect(() => {
    Animated.spring(categorySheetProgress, {
      toValue: isCategorySheetExpanded ? categoryRowParents.length : 0,
      damping: 18,
      stiffness: 190,
      mass: 0.8,
      useNativeDriver: false,
    }).start();
  }, [categoryRowParents.length, categorySheetProgress, isCategorySheetExpanded]);

  function stepBackBottomArea() {
    if (isAddingCategory || renamingCategoryId) {
      setIsAddingCategory(false);
      setRenamingCategoryId(null);
      setCategoryDraft('');
      return;
    }

    if (isCategorySheetOpen) {
      setIsCategorySheetOpen(false);
    }
  }

  const categorySheetPanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) => Math.abs(gestureState.dy) > 12,
    onPanResponderRelease: (_event, gestureState) => {
      if (gestureState.dy < -16) {
        if (isCategorySheetExpanded) {
          stepBackBottomArea();
        } else {
          setIsCategorySheetOpen(true);
        }
      }

      if (gestureState.dy > 16) {
        setIsCategorySheetOpen(false);
      }
    },
  });
  const bottomBackPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: stepBackBottomArea,
  });

  function getNotesForBoard(boardId: string | null) {
    const filteredNotes = notes.filter((note) => {
      const matchesBoard = isLibrary ? isNoteInLibraryBoard(note, boardId, libraryClock, libraryDayStartHour) : !boardId || note.boardIds.includes(boardId);
      const matchesCategory = doesCategoryMatchFilter(note.categoryIds, selectedCategoryId);

      return matchesBoard && matchesCategory;
    });

    if (boardId === 'today') {
      return [...filteredNotes].sort((firstNote, secondNote) => firstNote.position - secondNote.position);
    }

    if (boardId) {
      return filteredNotes;
    }

    return [...filteredNotes].sort((firstNote, secondNote) => {
      const priorityDifference = getBoardPriority(firstNote) - getBoardPriority(secondNote);

      return priorityDifference || secondNote.position - firstNote.position;
    });
  }

  function getPageKey(boardId: string | null) {
    return `${boardId ?? 'all'}:${selectedCategoryId ?? 'all'}`;
  }

  function createLibraryCategory() {
    const label = categoryDraft.trim();
    const categoryId = makeCategoryId(label);

    if (!categoryId) {
      setCategoryDraft('');
      setIsAddingCategory(false);
      return;
    }

    setCustomLibraryCategoryIds((current) => (current.includes(categoryId) ? current : [...current, categoryId]));
    setSelectedCategoryId(categoryId);
    setCategoryDraft('');
    setIsAddingCategory(false);
    setIsCategorySheetOpen(false);
  }

  function createTodoSubcategory() {
    const label = categoryDraft.trim();
    const categorySlug = makeCategoryId(label);

    if (!categorySlug) {
      setCategoryDraft('');
      setIsAddingCategory(false);
      return;
    }

    const categoryId = selectedCategoryId ? `${selectedCategoryId}/${categorySlug}` : categorySlug;

    setCustomTodoCategoryIds((current) => (current.includes(categoryId) ? current : [...current, categoryId]));
    setTodoCategoryLabels((current) => ({ ...current, [categoryId]: label }));
    setSelectedCategoryId(categoryId);
    setCategoryDraft('');
    setIsAddingCategory(false);
    setIsCategorySheetOpen(false);
  }

  function renameLibraryCategoryFromDraft() {
    const nextCategorySlug = makeCategoryId(categoryDraft);
    const categoryParentId = getParentCategoryId(renamingCategoryId);
    const nextCategoryId = categoryParentId && nextCategorySlug ? `${categoryParentId}/${nextCategorySlug}` : nextCategorySlug;

    if (!renamingCategoryId || !nextCategoryId || nextCategoryId === renamingCategoryId) {
      setCategoryDraft('');
      setRenamingCategoryId(null);
      return;
    }

    pendingRenameLabelRef.current = categoryDraft.trim();
    renameCategoryMutation.mutate({
      fromCategoryId: renamingCategoryId,
      toCategoryId: nextCategoryId,
    });
    setCategoryDraft('');
    setRenamingCategoryId(null);
    setIsCategorySheetOpen(false);
  }

  function startRenamingCategory(categoryId: string) {
    setIsAddingCategory(false);
    setIsCategorySheetOpen(true);
    setRenamingCategoryId(categoryId);
    setCategoryDraft(todoCategoryLabels[categoryId] ?? formatCategoryTitle(categoryId));
  }

  function confirmDeleteCategory(categoryId: string) {
    Alert.alert('Delete category?', 'This removes the label from matching notes. The notes stay saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteCategoryMutation.mutate({ categoryId }),
      },
    ]);
  }

  function openCategoryActions(categoryId: string) {
    Alert.alert(todoCategoryLabels[categoryId] ?? formatCategoryTitle(categoryId), `Edit this ${isLibrary ? 'Library' : 'Todo'} category.`, [
      { text: 'Rename', onPress: () => startRenamingCategory(categoryId) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDeleteCategory(categoryId) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function renderCategoryRow(parentCategoryId: string | null) {
    const rowCategories = isLibrary
      ? categories
      : categories.filter((category) => isDirectChildCategory(category.id, parentCategoryId));
    const rowSelectedCategory = parentCategoryId ? categories.find((category) => category.id === parentCategoryId) : null;

    return (
      <View key={parentCategoryId ?? 'root'} style={styles.categoryDrawerRow}>
        <ScrollView
          horizontal
          style={styles.categoryScroller}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}>
          {!isLibrary && parentCategoryId ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go up one category level"
                onPress={() => setSelectedCategoryId(getParentCategoryId(parentCategoryId))}
                style={({ pressed }) => [styles.addCategoryButton, pressed && styles.pressed]}>
                <Ionicons name="chevron-back" size={18} color="#c8ced3" />
              </Pressable>
              {rowSelectedCategory ? (
                <FilterChip
                  label={rowSelectedCategory.title}
                  toneId={rowSelectedCategory.id}
                  accessibilityLabel={`Clear category ${rowSelectedCategory.title}`}
                  selected
                  onPress={() => setSelectedCategoryId(null)}
                />
              ) : null}
            </>
          ) : null}
          {rowCategories.map((category) => (
            renamingCategoryId === category.id ? (
              <TextInput
                key={category.id}
                value={categoryDraft}
                onChangeText={setCategoryDraft}
                onSubmitEditing={renameLibraryCategoryFromDraft}
                onBlur={renameLibraryCategoryFromDraft}
                autoFocus
                autoCapitalize="sentences"
                placeholder="Category"
                placeholderTextColor={theme.textSecondary}
                style={[styles.categoryInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            ) : (
              <FilterChip
                key={category.id}
                label={category.title}
                toneId={category.id}
                accessibilityLabel={`Category ${category.title}`}
                selected={selectedCategoryId === category.id}
                onPress={() => setSelectedCategoryId((current) => (current === category.id ? getParentCategoryId(current) : category.id))}
                onLongPress={() => openCategoryActions(category.id)}
              />
            )
          ))}
          {isLibrary ? (
            isAddingCategory ? (
              <TextInput
                value={categoryDraft}
                onChangeText={setCategoryDraft}
                onSubmitEditing={createLibraryCategory}
                onBlur={createLibraryCategory}
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
                style={({ pressed }) => [styles.addCategoryButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.addCategoryText}>
                  +
                </ThemedText>
              </Pressable>
            )
          ) : parentCategoryId === selectedCategoryId ? (
            isAddingCategory ? (
              <TextInput
                value={categoryDraft}
                onChangeText={setCategoryDraft}
                onSubmitEditing={createTodoSubcategory}
                onBlur={createTodoSubcategory}
                autoFocus
                autoCapitalize="sentences"
                placeholder={selectedCategoryId ? 'Subcategory' : 'Category'}
                placeholderTextColor={theme.textSecondary}
                style={[styles.categoryInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selectedCategoryId ? 'Create todo subcategory' : 'Create todo category'}
                onPress={() => {
                  setIsCategorySheetOpen(true);
                  setIsAddingCategory(true);
                }}
                style={({ pressed }) => [styles.addCategoryButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.addCategoryText}>
                  +
                </ThemedText>
              </Pressable>
            )
          ) : null}
        </ScrollView>
        {!parentCategoryId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => router.push('/explore')}
            style={({ pressed }) => [styles.categorySettingsButton, pressed && styles.pressed]}>
            <SettingsIcon size={20} color="#555d64" />
          </Pressable>
        ) : null}
      </View>
    );
  }

  function applyDragOrder(pageKey: string, pageNotes: Note[]) {
    const orderIds = dragOrders[pageKey];

    if (!orderIds?.length) {
      return pageNotes;
    }

    const noteById = new Map(pageNotes.map((note) => [note.id, note]));
    const visibleOrderIds = orderIds.filter((id) => noteById.has(id));
    const orderedNotes = visibleOrderIds.flatMap((id) => {
      const note = noteById.get(id);
      return note ? [note] : [];
    });
    const orderedIds = new Set(visibleOrderIds);
    const newNotes = pageNotes.filter((note) => !orderedIds.has(note.id));

    if (visibleOrderIds.length !== orderIds.length) {
      const nextOrderIds = [...visibleOrderIds, ...newNotes.map((note) => note.id)];
      dragOrdersRef.current = { ...dragOrdersRef.current, [pageKey]: nextOrderIds };
      setDragOrders(dragOrdersRef.current);
    }

    return [...orderedNotes, ...newNotes];
  }

  function setPageDragOrder(pageKey: string, orderIds: string[]) {
    dragOrdersRef.current = { ...dragOrdersRef.current, [pageKey]: orderIds };
    setDragOrders(dragOrdersRef.current);
  }

  function handleBoardMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / availableWidth);
    const nextBoard = boardPages[nextIndex] ?? boardPages[0];

    setSelectedBoardId(nextBoard.id);
  }

  function goToBoardIndex(index: number) {
    boardPagerRef.current?.scrollTo({ x: index * availableWidth, animated: true });
    setSelectedBoardId(boardPages[index]?.id ?? null);
  }

  function cycleBoard() {
    if (!selectedBoardId) {
      goToBoardIndex(boardPages.findIndex((board) => board.id === boards[0]?.id));
      return;
    }

    const currentBoardIndex = Math.max(0, boards.findIndex((board) => board.id === selectedBoardId));
    const direction = 1;
    const nextBoard = boards[(currentBoardIndex + direction + boards.length) % boards.length];

    if (nextBoard) {
      goToBoardIndex(boardPages.findIndex((board) => board.id === nextBoard.id));
    }
  }

  function showAllBoards() {
    if (!selectedBoardId) {
      goToBoardIndex(boardPages.findIndex((board) => board.id === boards[0]?.id));
      return;
    }

    goToBoardIndex(boardPages.findIndex((board) => board.id === null));
  }

  function switchSection() {
    const nextSection: NoteKind = isLibrary ? 'note' : 'library';
    AsyncStorage.setItem(LastSectionStorageKey, nextSection)
      .catch(() => undefined)
      .finally(() => {
        router.replace((isLibrary ? '/' : '/library') as never);
      });
  }

  function saveOrder(orderIds: string[]) {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in from Account before reordering synced notes.');
      return;
    }

    if (reorderMutation.isPending) {
      return;
    }

    reorderMutation.mutate({ noteIds: orderIds });
  }

  function getBoardMoveTarget(note: Note, direction: 'previous' | 'next') {
    const currentBoardId = selectedBoardId ?? note.boardIds[0] ?? boards[0]?.id;
    const currentIndex = Math.max(
      0,
      boards.findIndex((board) => board.id === currentBoardId),
    );
    const offset = direction === 'previous' ? -1 : 1;
    const nextIndex = (currentIndex + offset + boards.length) % boards.length;

    return boards[nextIndex];
  }

  function moveNoteToAdjacentBoard(note: Note, direction: 'previous' | 'next') {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in from Account before moving synced notes.');
      return;
    }

    if (moveBoardMutation.isPending) {
      return;
    }

    const targetBoard = getBoardMoveTarget(note, direction);

    if (!targetBoard) {
      return;
    }

    moveBoardMutation.mutate({ note, boardId: targetBoard.id });
  }

  async function copyLibraryNote(note: Note) {
    const copyText = getCopyText(note);

    setActiveActionNoteId(null);

    if (!copyText) {
      return;
    }

    await Clipboard.setStringAsync(copyText);

    if (Platform.OS === 'android') {
      ToastAndroid.show('Copied', ToastAndroid.SHORT);
    }
  }

  async function openLibraryNoteInChatGPT(note: Note) {
    const copyText = getCopyText(note);

    setActiveActionNoteId(null);

    if (copyText) {
      await Clipboard.setStringAsync(copyText);
    }

    const chatGptUrls = Platform.OS === 'android'
      ? [
          'intent://#Intent;package=com.openai.chatgpt;end',
          'intent://chatgpt.com/#Intent;scheme=https;package=com.openai.chatgpt;end',
          'chatgpt://',
        ]
      : ['chatgpt://'];

    for (const url of chatGptUrls) {
      try {
        await Linking.openURL(url);
        return;
      } catch {
        // Try the next known app link before falling back to the website.
      }
    }

    await WebBrowser.openBrowserAsync('https://chatgpt.com/');
  }

  async function openLibraryNoteUrl(note: Note) {
    const firstUrl = getFirstUrl(note.body);

    setActiveActionNoteId(null);

    if (!firstUrl) {
      return;
    }

    await WebBrowser.openBrowserAsync(firstUrl);
  }

  function toggleLibraryNoteDone(note: Note) {
    setActiveActionNoteId(null);

    if (!user) {
      Alert.alert('Sign in required', 'Sign in from Account before updating synced notes.');
      return;
    }

    if (doneMutation.isPending) {
      return;
    }

    const nextDone = !note.done;
    setDoneOverrides((current) => {
      const nextOverrides = { ...current, [note.id]: nextDone };
      AsyncStorage.setItem(getLibraryDoneStorageKey(user.id), JSON.stringify(nextOverrides)).catch(() => undefined);
      return nextOverrides;
    });
    doneMutation.mutate({ id: note.id, done: nextDone });
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <View style={[styles.content, { paddingBottom: contentBottomPadding, paddingHorizontal: screenSidePadding }]}>
          <View style={[styles.header, isLibrary && styles.headerLibrary]}>
            <View style={[styles.headerTitleRow, isLibrary && styles.headerTitleRowLibrary]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Current board ${selectedBoard.title}. Tap to switch board. Long press for all boards.`}
                onPress={cycleBoard}
                onLongPress={showAllBoards}
                style={({ pressed }) => [styles.boardTitleButton, isLibrary && styles.boardTitleButtonLibrary, pressed && styles.pressed]}>
                <ThemedText type="subtitle" style={[styles.boardTitle, isLibrary && styles.boardTitleLibrary]} numberOfLines={1} ellipsizeMode="tail">
                  {selectedBoard.title}
                </ThemedText>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isLibrary ? 'Open todo' : 'Open library'}
              onPress={switchSection}
              style={({ pressed }) => [styles.iconButton, styles.secondaryIconButton, pressed && styles.pressed]}>
              <Ionicons name={isLibrary ? 'albums-outline' : 'checkbox-outline'} size={22} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.boardProgress}>
            {boardPages.map((board, index) => (
              <Pressable
                key={board.id ?? 'all'}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${board.title}`}
                onPress={() => goToBoardIndex(index)}
                style={[
                  styles.boardDot,
                  {
                    backgroundColor: selectedBoardIndex === index ? board.color : theme.backgroundSelected,
                    width: selectedBoardIndex === index ? 28 : 8,
                  },
                ]}
              />
            ))}
          </View>

          <ScrollView
            ref={boardPagerRef}
            horizontal
            pagingEnabled
            contentOffset={{ x: selectedBoardIndex * availableWidth, y: 0 }}
            scrollEnabled={!activeDragPageKey}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleBoardMomentumEnd}
            style={[styles.boardPager, { marginHorizontal: gridSidePadding - screenSidePadding }]}>
            {boardPages.map((board) => {
              const pageKey = getPageKey(board.id);
              const boardNotes = getNotesForBoard(board.id);
              const pageNotes = board.id === null ? boardNotes : applyDragOrder(pageKey, boardNotes);
              const masonryColumns = Array.from({ length: noteColumnCount }, (_, columnIndex) =>
                pageNotes.filter((_, noteIndex) => noteIndex % noteColumnCount === columnIndex),
              );

              return (
                <View key={board.id ?? 'all'} style={[styles.boardPage, { width: availableWidth }]}>
                  {isLibrary ? (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.notesScroll}>
                      {pageNotes.length ? (
                        <View style={[styles.libraryMasonry, { gap }]}>
                          {masonryColumns.map((columnNotes, columnIndex) => (
                            <View key={columnIndex} style={[styles.libraryMasonryColumn, { width: tileWidth }]}>
                              {columnNotes.map((item) => {
                                const displayedItem = {
                                  ...item,
                                  done: doneOverrides[item.id] ?? item.done,
                                };

                                return (
                                  <NoteTile
                                    key={item.id}
                                    note={displayedItem}
                                    width={tileWidth}
                                    active={false}
                                    itemGap={gap}
                                    showBoardStatus={board.id === null}
                                    showUnboardedTone={false}
                                    showActionBar={activeActionNoteId === item.id}
                                    onPress={() =>
                                      router.push({
                                        pathname: '/note/[id]',
                                        params: { id: item.id, kind: noteKind },
                                      })
                                    }
                                    onLongPress={() => setActiveActionNoteId((current) => (current === item.id ? null : item.id))}
                                    onCopy={() => copyLibraryNote(displayedItem)}
                                    onOpenChatGPT={() => openLibraryNoteInChatGPT(displayedItem)}
                                    onOpenUrl={() => openLibraryNoteUrl(displayedItem)}
                                    onToggleDone={() => toggleLibraryNoteDone(displayedItem)}
                                    onMoveToPreviousBoard={() => undefined}
                                    onMoveToNextBoard={() => undefined}
                                    boards={boards}
                                    categories={categories}
                                    showBoardActions={false}
                                  />
                                );
                              })}
                            </View>
                          ))}
                        </View>
                      ) : (
                      <View style={[styles.emptyState, { borderColor: theme.backgroundSelected }]}>
                        {notesQuery.error ? (
                          <>
                            <ThemedText type="smallBold">Could not load notes.</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {notesQuery.error instanceof Error ? notesQuery.error.message : 'Try refreshing in a moment.'}
                            </ThemedText>
                          </>
                        ) : (
                          <>
                            <ThemedText type="smallBold">No notes match these filters.</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              Try all boards or all categories.
                            </ThemedText>
                          </>
                        )}
                      </View>
                      )}
                    </ScrollView>
                  ) : (
                    <DraggableFlatList
                      key={`${pageKey}:${noteColumnCount}`}
                      data={pageNotes}
                      keyExtractor={(note) => note.id}
                      numColumns={noteColumnCount}
                      columnWrapperStyle={noteColumnCount > 1 ? [styles.notesGridRow, { gap }] : undefined}
                      showsVerticalScrollIndicator={false}
                      activationDistance={8}
                      autoscrollThreshold={80}
                      autoscrollSpeed={70}
                      containerStyle={styles.notesList}
                      contentContainerStyle={styles.notesScroll}
                      onDragBegin={() => setActiveDragPageKey(pageKey)}
                      onDragEnd={({ data }) => {
                        const orderIds = data.map((note) => note.id);

                        setActiveDragPageKey(null);
                        setPageDragOrder(pageKey, orderIds);
                        saveOrder(orderIds);
                      }}
                      onRelease={() => setActiveDragPageKey(null)}
                      renderItem={({ item, drag, isActive }: RenderItemParams<Note>) => (
                        <NoteTile
                          note={item}
                          width={tileWidth}
                          active={isActive}
                          itemGap={gap}
                          showBoardStatus={board.id === null}
                          showUnboardedTone={board.id === null}
                          showActionBar={false}
                          onPress={() =>
                            router.push({
                              pathname: '/note/[id]',
                              params: { id: item.id, kind: noteKind },
                            })
                          }
                          onLongPress={drag}
                          onMoveToPreviousBoard={() => moveNoteToAdjacentBoard(item, 'previous')}
                          onMoveToNextBoard={() => moveNoteToAdjacentBoard(item, 'next')}
                          boards={boards}
                          categories={categories}
                          showBoardActions
                        />
                      )}
                      ListEmptyComponent={
                        <View style={[styles.emptyState, { borderColor: theme.backgroundSelected }]}>
                          {notesQuery.error ? (
                            <>
                              <ThemedText type="smallBold">Could not load notes.</ThemedText>
                              <ThemedText type="small" themeColor="textSecondary">
                                {notesQuery.error instanceof Error ? notesQuery.error.message : 'Try refreshing in a moment.'}
                              </ThemedText>
                            </>
                          ) : (
                            <>
                              <ThemedText type="smallBold">No notes match these filters.</ThemedText>
                              <ThemedText type="small" themeColor="textSecondary">
                                Try all boards or all categories.
                              </ThemedText>
                            </>
                          )}
                        </View>
                      }
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>
      {shouldShowBottomBackLayer ? (
        <View
          {...bottomBackPanResponder.panHandlers}
          style={[styles.bottomBackLayer, { bottom: bottomControlsOffset + categorySheetHeight + insets.bottom }]}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create note"
        onPress={() =>
          router.push({
            pathname: isLibrary ? '/new-library-note' : '/new-note',
            params: {
              boardId: isLibrary ? '' : selectedBoardId ?? '',
              categoryId: selectedCategoryId ?? '',
            },
          } as never)
        }
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: bottomControlsOffset + categorySheetHeight + insets.bottom + Spacing.two,
          },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="subtitle" style={styles.fabText}>
          +
        </ThemedText>
      </Pressable>
      <Animated.View
        {...categorySheetPanResponder.panHandlers}
        style={[
          styles.bottomControls,
          {
            bottom: bottomControlsOffset,
            height: CategorySheetRowHeight + insets.bottom,
            paddingBottom: insets.bottom,
          },
        ]}>
        <Animated.View
          style={[
            styles.categorySheetRail,
            { height: CategorySheetRowHeight * (categoryRowParents.length + 1) },
            {
              transform: [
                {
                  translateY: categorySheetProgress.interpolate({
                    inputRange: [0, Math.max(1, categoryRowParents.length)],
                    outputRange: [0, -CategorySheetRowHeight * Math.max(1, categoryRowParents.length)],
                  }),
                },
              ],
            },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isCategorySheetExpanded ? 'Hide categories' : 'Show categories'}
            onPress={() => setIsCategorySheetOpen((current) => !current)}
            style={({ pressed }) => [styles.categorySheetHandle, pressed && styles.pressed]}>
            <View style={styles.categorySheetTitleRow}>
              <Ionicons name="chevron-up" size={18} color="#555d64" />
            </View>
          </Pressable>
          {categoryRowParents.map((parentCategoryId) => renderCategoryRow(parentCategoryId))}
        </Animated.View>
      </Animated.View>
      {insets.bottom ? (
        <View
          pointerEvents="none"
          style={[styles.navigationBarCover, { height: insets.bottom }]}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  headerLibrary: {
    flexDirection: 'row-reverse',
  },
  headerTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerTitleRowLibrary: {
    justifyContent: 'flex-end',
  },
  boardTitle: {
    maxWidth: '100%',
    flexShrink: 1,
  },
  boardTitleLibrary: {
    textAlign: 'right',
  },
  boardTitleButton: {
    flexShrink: 1,
    maxWidth: '100%',
  },
  boardTitleButtonLibrary: {
    alignItems: 'flex-end',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#243b37',
  },
  secondaryIconButton: {
    backgroundColor: 'transparent',
  },
  fab: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.two,
    zIndex: 12,
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#243b37',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 8,
  },
  fabText: {
    color: Colors.light.background,
    lineHeight: 34,
  },
  notesScroll: {
    paddingBottom: 136,
  },
  notesGridRow: {
    gap: Spacing.three,
  },
  libraryMasonry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  libraryMasonryColumn: {
    flexShrink: 0,
  },
  notesList: {
    flex: 1,
    width: '100%',
  },
  boardProgress: {
    minHeight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  boardDot: {
    height: 8,
    borderRadius: 4,
  },
  boardPager: {
    flex: 1,
  },
  boardPage: {
    flex: 1,
    gap: Spacing.three,
  },
  filterChip: {
    height: 40,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCategoryButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c1f22',
  },
  addCategoryText: {
    color: '#c8ced3',
    fontSize: 20,
    lineHeight: 24,
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
  categoryList: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: CategorySheetRowHeight,
  },
  categoryDrawerRow: {
    height: CategorySheetRowHeight,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryScroller: {
    flex: 1,
    height: CategorySheetRowHeight,
    maxHeight: CategorySheetRowHeight,
  },
  categorySettingsButton: {
    width: 44,
    height: 44,
    marginRight: Spacing.two,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    borderTopWidth: 0,
    paddingTop: 0,
    backgroundColor: '#000000',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  bottomBackLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    backgroundColor: 'transparent',
  },
  navigationBarCover: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 11,
    backgroundColor: '#000000',
  },
  categorySheetRail: {
    height: 112,
  },
  categorySheetHandle: {
    height: CategorySheetRowHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySheetTitleRow: {
    alignSelf: 'stretch',
    minHeight: CategorySheetRowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: 92,
  },
  sectionHeader: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteTile: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    padding: Spacing.two,
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  metadataChip: {
    minHeight: 22,
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    justifyContent: 'center',
  },
  metadataChipText: {
    fontSize: 12,
    lineHeight: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  emptyCardTitle: {
    flex: 1,
  },
  cardTitleButton: {
    flex: 1,
    minWidth: 0,
  },
  cardBodyButton: {
    alignSelf: 'stretch',
    width: '100%',
  },
  libraryActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingTop: Spacing.half,
  },
  libraryActionButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#202428',
  },
  libraryActionButtonSelected: {
    backgroundColor: '#243b37',
  },
  boardStatusBadges: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    flexShrink: 0,
  },
  boardStatusBadge: {
    minWidth: 14,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  boardStatusBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#9aa1a8',
  },
  cardBoardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.one,
    flexShrink: 0,
  },
  cardBoardButton: {
    width: 28,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d2023',
  },
  noteTitle: {
    fontSize: 17,
    flex: 1,
    flexShrink: 1,
    lineHeight: 23,
    maxWidth: '100%',
  },
  noteBody: {
    alignSelf: 'stretch',
    flexShrink: 1,
    lineHeight: 19,
    width: '100%',
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.75,
  },
});
