import type { RoomAccessMode } from "@openshare/shared";

export type PersistedRoom = {
  id: string;
  accessMode: RoomAccessMode;
  viewerDrawingEnabled: boolean;
  passwordHash?: string | null;
  hostTokenHash?: string | null;
  locked?: boolean;
  viewerLimit?: number;
  persistent?: boolean;
  wasSharing: boolean;
  createdAt: number;
  updatedAt: number;
};

export interface RoomPersistence {
  loadRooms(): Promise<PersistedRoom[]>;
  saveRoom(room: PersistedRoom, ttlSeconds: number): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
}
