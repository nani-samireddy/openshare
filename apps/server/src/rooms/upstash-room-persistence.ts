import { Redis } from "@upstash/redis";
import type { PersistedRoom, RoomPersistence } from "./room-persistence.js";

const ROOM_KEY_PREFIX = "openshare:room:";
const ROOM_INDEX_KEY = "openshare:rooms";

export class UpstashRoomPersistence implements RoomPersistence {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async loadRooms(): Promise<PersistedRoom[]> {
    const roomIds = await this.redis.smembers<string[]>(ROOM_INDEX_KEY);
    if (roomIds.length === 0) {
      return [];
    }

    const rooms = await this.redis.mget<Array<PersistedRoom | null>>(...roomIds.map(roomKey));
    const staleRoomIds: string[] = [];
    const persistedRooms: PersistedRoom[] = [];

    rooms.forEach((room, index) => {
      if (room) {
        persistedRooms.push(room);
      } else {
        const roomId = roomIds[index];
        if (roomId) {
          staleRoomIds.push(roomId);
        }
      }
    });

    if (staleRoomIds.length > 0) {
      await this.redis.srem(ROOM_INDEX_KEY, ...staleRoomIds);
    }

    return persistedRooms;
  }

  async saveRoom(room: PersistedRoom, ttlSeconds: number): Promise<void> {
    await this.redis
      .pipeline()
      .set(roomKey(room.id), room, { ex: ttlSeconds })
      .sadd(ROOM_INDEX_KEY, room.id)
      .exec();
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.redis.pipeline().del(roomKey(roomId)).srem(ROOM_INDEX_KEY, roomId).exec();
  }
}

function roomKey(roomId: string): string {
  return `${ROOM_KEY_PREFIX}${roomId}`;
}
