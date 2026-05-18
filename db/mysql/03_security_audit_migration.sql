-- Aetheria — Security/perf audit migration (idempotent).
--
-- Applied AFTER 01_init.sql + 02_seed.sql in prod. Adds:
--   - runs.revision    : optimistic-lock counter for combat snapshot CAS
--   - friendships      : (userId,status) + (friendId,status) composite indexes
--                        for the OR-branch in ChatService.assertNotBlocked
--   - chat_messages    : (senderId, channelType, channelId, createdAt)
--                        composite for the whisper-pair OR branch
--
-- All statements use IF NOT EXISTS / are idempotent so re-running this
-- migration is safe. Run via `bash scripts/apply-seed.sh` style (no
-- destructive ops).

USE `aetheria`;

-- ─── runs.revision ─────────────────────────────────────────────────
-- Bumped on every snapshot/actionLog write. Lets CombatRunService
-- detect concurrent submitAction races (see service.ts updateMany
-- where revision matches loaded value).
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'runs' AND column_name = 'revision'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `runs` ADD COLUMN `revision` INT NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── friendships composite indexes ─────────────────────────────────
-- ChatService.assertNotBlocked runs
--   WHERE status='blocked' AND ((userId=A AND friendId=B) OR (userId=B AND friendId=A))
-- on every whisper send. The base @@id([userId,friendId]) covers the
-- forward direction but the OR branch falls back to a scan with the
-- existing ix_friendships_friend index. These two composites turn each
-- branch into a single index seek.
SET @ix1 = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'friendships'
    AND index_name = 'ix_friendships_user_status'
);
SET @sql = IF(@ix1 = 0,
  'CREATE INDEX `ix_friendships_user_status` ON `friendships` (`user_id`, `status`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ix2 = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'friendships'
    AND index_name = 'ix_friendships_friend_status'
);
SET @sql = IF(@ix2 = 0,
  'CREATE INDEX `ix_friendships_friend_status` ON `friendships` (`friend_id`, `status`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─── chat_messages whisper-pair index ──────────────────────────────
-- Whisper history fetch uses
--   OR [(senderId=A, channelType='whisper', channelId=B),
--       (senderId=B, channelType='whisper', channelId=A)]
-- ORDER BY createdAt DESC. The existing (channelType, channelId, createdAt)
-- index covers branch 1; this composite covers branch 2's
-- (senderId, channelType, channelId, createdAt).
SET @ix3 = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'chat_messages'
    AND index_name = 'ix_chat_sender_channel_time'
);
SET @sql = IF(@ix3 = 0,
  'CREATE INDEX `ix_chat_sender_channel_time` ON `chat_messages` (`sender_id`, `channel_type`, `channel_id`, `created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
