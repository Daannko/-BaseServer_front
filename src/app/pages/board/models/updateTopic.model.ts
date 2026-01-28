import { JSONContent } from '@tiptap/core';

export interface UpdateTopic {
  name: JSONContent;
  content: JSONContent;
  x: number;
  y: number;
  width: number;
  height: number;
  topicsToBeAdded?: string[];
  topicsToBeRemoved?: string[];
}
