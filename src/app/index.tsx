import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import NotesScreen from '@/features/notes/notes-screen';

const LastSectionStorageKey = 'notes:last-section';

export default function TodoScreen() {
  const router = useRouter();
  const [canRenderTodo, setCanRenderTodo] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LastSectionStorageKey).then((lastSection) => {
      if (lastSection === 'library') {
        router.replace('/library');
        return;
      }

      setCanRenderTodo(true);
    });
  }, [router]);

  if (!canRenderTodo) {
    return null;
  }

  return <NotesScreen noteKind="note" />;
}
