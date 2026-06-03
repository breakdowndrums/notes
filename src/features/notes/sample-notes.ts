import { Note, NoteBoard, NoteCategory } from './types';

export const sampleBoards: NoteBoard[] = [
  { id: 'today', title: 'Today', color: '#2f6f73' },
  { id: 'tomorrow', title: 'Tomorrow', color: '#536d8f' },
  { id: 'this-week', title: 'This week', color: '#7c5c2e' },
];

export const libraryBoards: NoteBoard[] = [
  { id: 'today', title: 'Today', color: '#2f6f73' },
  { id: 'yesterday', title: 'Yesterday', color: '#536d8f' },
  { id: 'this-week', title: 'This week', color: '#7c5c2e' },
];

export const sampleCategories: NoteCategory[] = [
  { id: 'coding', title: 'Coding', color: '#3b82f6' },
  { id: 'writing', title: 'Writing', color: '#a855f7' },
  { id: 'work', title: 'Work', color: '#0f766e' },
];

export const libraryCategories: NoteCategory[] = [];

export const sampleNotes: Note[] = [
  {
    id: 'note-1',
    kind: 'note',
    title: 'App direction',
    body: 'Android first. Keep the web preview useful, but design gestures and spacing around thumb reach.',
    color: '#fff3bf',
    boardIds: ['today'],
    categoryIds: ['work'],
    pinned: true,
    position: 600,
    createdAt: new Date().toISOString(),
    updatedAt: 'Today',
  },
  {
    id: 'note-2',
    kind: 'note',
    title: 'Supabase setup',
    body: 'Auth is connected. Next pass should persist notes with owner_id, title, body, color, pinned, archived, and updated_at.',
    color: '#d8f3dc',
    boardIds: ['today', 'this-week'],
    categoryIds: ['coding', 'work'],
    pinned: true,
    position: 500,
    createdAt: new Date().toISOString(),
    updatedAt: 'Today',
  },
  {
    id: 'note-3',
    kind: 'note',
    title: 'Interaction ideas',
    body: 'Tap opens a full note. Long press can select. Later: color picker, archive, labels, reminders, search.',
    color: '#dbeafe',
    boardIds: ['tomorrow'],
    categoryIds: ['coding'],
    position: 400,
    createdAt: new Date().toISOString(),
    updatedAt: 'Yesterday',
  },
  {
    id: 'note-4',
    kind: 'note',
    title: 'Tiny capture',
    body: 'A note should take less than two seconds to create.',
    color: '#fde2e4',
    boardIds: ['today'],
    categoryIds: ['writing'],
    position: 300,
    createdAt: new Date().toISOString(),
    updatedAt: 'Yesterday',
  },
  {
    id: 'note-5',
    kind: 'note',
    title: 'Board mode?',
    body: 'Maybe keep Trello boards as an optional view later. Notes grid should be the default home.',
    color: '#f1f5f9',
    boardIds: ['this-week'],
    categoryIds: ['writing'],
    position: 200,
    createdAt: new Date().toISOString(),
    updatedAt: 'May 30',
  },
  {
    id: 'note-6',
    kind: 'note',
    title: 'Offline',
    body: 'Cache notes locally and sync changes when the app comes back online. Start simple: server is source of truth.',
    color: '#fae8ff',
    boardIds: ['this-week'],
    categoryIds: ['coding'],
    position: 100,
    createdAt: new Date().toISOString(),
    updatedAt: 'May 29',
  },
];

export const sampleLibraryNotes: Note[] = [];
