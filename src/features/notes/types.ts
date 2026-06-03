export type Note = {
  id: string;
  kind: NoteKind;
  title: string;
  body: string;
  color: string;
  boardIds: string[];
  categoryIds: string[];
  pinned?: boolean;
  done?: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type NoteKind = 'note' | 'library';

export type NoteBoard = {
  id: string;
  title: string;
  color: string;
};

export type NoteCategory = {
  id: string;
  title: string;
  color: string;
};
