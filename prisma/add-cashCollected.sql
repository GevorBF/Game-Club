-- Manual migration: add cashCollected column to Session (if db push fails)
-- Run with: sqlite3 prisma/dev.db < prisma/add-cashCollected.sql

ALTER TABLE "Session" ADD COLUMN "cashCollected" BOOLEAN NOT NULL DEFAULT 0;
