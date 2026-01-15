
export type Role = 'user' | 'model';

export interface Message {
  role: Role;
  text: string;
  timestamp: Date;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export type MealType = 'mindful' | 'unmindful';

export interface DailyStats {
  pauses: number;
  moodScores: number[]; // 1-5
  meals: MealType[];
}

export type ReminderType = 'pause' | 'log';

export interface Reminder {
  id: string;
  time: string; // HH:mm
  type: ReminderType;
  enabled: boolean;
}
