import { JSONContent } from '@tiptap/core';

export interface CreateTopic {
  boardId: string;
  title: JSONContent;
  content: JSONContent;
  x: number;
  y: number;
  width: number;
  height: number;
  relatedTopics: Array<string>;
}
