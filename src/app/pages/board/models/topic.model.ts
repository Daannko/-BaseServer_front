import { JSONContent } from '@tiptap/core';

export interface Topic {
  id: string;
  title: JSONContent;
  content: JSONContent;
  note: string;
  x: number;
  y: number;
  width: number;
  height: number;
  relatedTopics?: string[];
}
