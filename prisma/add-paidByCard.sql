-- Manual migration: add paidByCard column to Session (if db push fails)
-- Run with: sqlite3 prisma/dev.db < prisma/add-paidByCard.sql

-- SQLite doesn't support IF NOT EXISTS for columns; this will error if column already exists (safe to ignore)
ALTER TABLE "Session" ADD COLUMN "paidByCard" BOOLEAN NOT NULL DEFAULT 0;
