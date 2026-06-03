export type Card = {
  id: string;
  listId: string;
  title: string;
  body?: string;
  label?: string;
  due?: string;
  position: number;
};

export type BoardList = {
  id: string;
  boardId: string;
  title: string;
  position: number;
  cards: Card[];
};

export type Board = {
  id: string;
  title: string;
  color: string;
  lists: BoardList[];
};
