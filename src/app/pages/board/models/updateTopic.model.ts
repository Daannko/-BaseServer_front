export interface UpdateTopic {
  title: string;
  content: string;
  note: string;
  x: number;
  y: number;
  width: number;
  height: number;
  topicsToBeAdded?: string[];
  topicsToBeRemoved?: string[];
}
