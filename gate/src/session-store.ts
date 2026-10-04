export interface SessionEntry<T> {
  value: T;
  expiresAt: number;
}

export interface SessionStore {
  get<T>(key: string): Promise<SessionEntry<T> | undefined>;
  set<T>(key: string, value: T, expiresAt: number): Promise<void>;
  renew<T>(key: string, value: T, expiresAt: number): Promise<boolean>;
  delete(key: string): Promise<void>;
  consume<T>(key: string): Promise<SessionEntry<T> | undefined>;
}

export class MemorySessionStore implements SessionStore {
  private readonly entries = new Map<string, SessionEntry<unknown>>();

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: string): Promise<SessionEntry<T> | undefined> {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry as SessionEntry<T>;
  }

  async set<T>(key: string, value: T, expiresAt: number): Promise<void> {
    if (expiresAt <= this.now()) {
      this.entries.delete(key);
      return;
    }
    this.entries.set(key, { value, expiresAt });
  }

  async renew<T>(key: string, value: T, expiresAt: number): Promise<boolean> {
    const current = this.entries.get(key);
    if (!current || current.expiresAt <= this.now() || expiresAt <= this.now()) {
      this.entries.delete(key);
      return false;
    }
    this.entries.set(key, { value, expiresAt });
    return true;
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async consume<T>(key: string): Promise<SessionEntry<T> | undefined> {
    const entry = this.entries.get(key);
    this.entries.delete(key);
    if (!entry || entry.expiresAt <= this.now()) return undefined;
    return entry as SessionEntry<T>;
  }
}