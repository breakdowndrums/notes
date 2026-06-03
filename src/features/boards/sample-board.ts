import { Board } from './types';

export const sampleBoard: Board = {
  id: 'local-board',
  title: 'Today',
  color: '#2f6f73',
  lists: [
    {
      id: 'inbox',
      boardId: 'local-board',
      title: 'Inbox',
      position: 0,
      cards: [
        {
          id: 'card-1',
          listId: 'inbox',
          title: 'Capture quick notes',
          body: 'Fast entry first, polish later.',
          label: 'idea',
          position: 0,
        },
        {
          id: 'card-2',
          listId: 'inbox',
          title: 'Sketch Android board gestures',
          label: 'mobile',
          position: 1,
        },
      ],
    },
    {
      id: 'active',
      boardId: 'local-board',
      title: 'Active',
      position: 1,
      cards: [
        {
          id: 'card-3',
          listId: 'active',
          title: 'Wire Supabase auth',
          body: 'Email magic link first. OAuth can wait.',
          label: 'backend',
          due: 'v1',
          position: 0,
        },
      ],
    },
    {
      id: 'later',
      boardId: 'local-board',
      title: 'Later',
      position: 2,
      cards: [
        {
          id: 'card-4',
          listId: 'later',
          title: 'Offline mutation queue',
          body: 'Add after basic boards feel right.',
          label: 'sync',
          position: 0,
        },
      ],
    },
  ],
};
