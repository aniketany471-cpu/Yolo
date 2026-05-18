import Database from 'better-sqlite3';

// FIX-5: Accept either an existing Database instance OR a file path string.
// When an instance is passed, the caller's single connection is reused —
// no second SQLite handle is opened against the same file.
export function createMemoryStore(dbOrPath) {
  const isPath = typeof dbOrPath === 'string';
  const mdb = isPath ? new Database(dbOrPath) : dbOrPath;

  // Only configure pragma + WAL when we own the connection (path was given).
  // When sharing the caller's DB, the caller already set journal_mode.
  if (isPath) {
    mdb.pragma('journal_mode = WAL');
  }

  mdb.exec(`
    CREATE TABLE IF NOT EXISTS ai_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT,
      chatId TEXT,
      topic TEXT,
      role TEXT,
      content TEXT,
      ts INTEGER
    );
  `);

  const put = mdb.prepare('INSERT INTO ai_memory (userId, chatId, topic, role, content, ts) VALUES (?, ?, ?, ?, ?, ?)');
  const recent = mdb.prepare('SELECT role, content, topic, ts FROM ai_memory WHERE (userId = ? OR ? IS NULL) AND (chatId = ? OR ? IS NULL) ORDER BY ts DESC LIMIT ?');
  const byTopic = mdb.prepare('SELECT role, content, topic, ts FROM ai_memory WHERE (userId = ? OR ? IS NULL) AND (chatId = ? OR ? IS NULL) AND topic = ? ORDER BY ts DESC LIMIT ?');

  return {
    save({ userId, chatId, topic, role, content }) {
      put.run(userId || null, chatId || null, topic || null, role, content, Date.now());
    },
    getRecent({ userId, chatId, limit = 20 }) {
      return recent.all(userId || null, userId || null, chatId || null, chatId || null, limit).reverse();
    },
    getByTopic({ userId, chatId, topic, limit = 12 }) {
      return byTopic.all(userId || null, userId || null, chatId || null, chatId || null, topic, limit).reverse();
    }
  };
}
