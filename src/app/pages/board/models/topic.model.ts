export interface Topic {
  id: string;
  title: string;
  content: string;
  note: string;
  x: number;
  y: number;
  width: number;
  height: number;
  relatedTopics?: string[];
}
