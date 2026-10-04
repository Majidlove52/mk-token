import Redis from "ioredis";
import { SessionEntry, SessionStore } from "./session-store";

const GET_AND_DELETE = [
  "local value = redis.call('GET', KEYS[1])",
  "if value then redis.call('DEL', KEYS[1]) end",
  "return value",
].join("\n");

const RENEW_IF_PRESENT = [
  "local raw = redis.call('GET', KEYS[1])",
  "if not raw then return 0 end",
  "local current = cjson.decode(raw)",
  "if tonumber(current.expiresAt) <= tonumber(ARGV[1]) then redis.call('DEL', KEYS[1]); return 0 end",
  "redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])",
  "return 1",
].join("\n");

export class RedisSessionStore implements SessionStore {
  private readonly client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
  }

  async get<T>(key: string): Promise<SessionEntry<T> | undefined> {
    const raw = await this.client.get(key);
    if (!raw) return undefined;
    return this.deserialize<T>(key, raw);
  }

  async set<T>(key: string, value: T, expiresAt: number): Promise<void> {
    const ttlMs = expiresAt - Date.now();
    if (ttlMs <= 0) {
      await this.delete(key);
      return;
    }
    const entry: SessionEntry<T> = { value, expiresAt };
    await this.client.set(key, JSON.stringify(entry), "PX", ttlMs);
  }

  async renew<T>(key: string, value: T, expiresAt: number): Promise<boolean> {
    const ttlMs = expiresAt - Date.now();
    if (ttlMs <= 0) return false;
    const entry: SessionEntry<T> = { value, expiresAt };
    const result = await this.client.eval(
      RENEW_IF_PRESENT,
      1,
      key,
      Date.now(),
      JSON.stringify(entry),
      ttlMs,
    );
    return Number(result) === 1;
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async consume<T>(key: string): Promise<SessionEntry<T> | undefined> {
    const raw = await this.client.eval(GET_AND_DELETE, 1, key);
    if (typeof raw !== "string") return undefined;
    return this.deserialize<T>(key, raw);
  }

  private async deserialize<T>(key: string, raw: string): Promise<SessionEntry<T> | undefined> {
    try {
      const entry = JSON.parse(raw) as SessionEntry<T>;
      if (typeof entry.expiresAt !== "number" || entry.expiresAt <= Date.now()) {
        await this.delete(key);
        return undefined;
      }
      return entry;
    } catch {
      await this.delete(key);
      return undefined;
    }
  }
}