-- Aetheria — Prisma migration 0005_notifications (MySQL).
-- Per-user notification feed driven by domain-events subscribers and
-- explicit `notify.push` calls (admin grants, system messages, etc).

CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `type`       VARCHAR(32)     NOT NULL,
  `payload`    JSON            NOT NULL,
  `read_at`    DATETIME(3)     NULL,
  `created_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_notifications_user_time`   (`user_id`, `created_at`),
  KEY `ix_notifications_user_unread` (`user_id`, `read_at`),
  CONSTRAINT `fk_notifications_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
