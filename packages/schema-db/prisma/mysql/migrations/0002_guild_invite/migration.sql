-- Aetheria — Prisma migration 0002_guild_invite (MySQL).
-- Adds the `guild_invites` table needed by the Guild service
-- (invite / respond / cancel pipeline).

CREATE TABLE IF NOT EXISTS `guild_invites` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `guild_id`          BIGINT UNSIGNED NOT NULL,
  `target_user_id`    BIGINT UNSIGNED NOT NULL,
  `inviter_user_id`   BIGINT UNSIGNED NOT NULL,
  `status`            VARCHAR(16)  NOT NULL DEFAULT 'pending',
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `responded_at`      DATETIME(3)  NULL,
  `expires_at`        DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_guild_invites_guild_status`  (`guild_id`, `status`),
  KEY `ix_guild_invites_target_status` (`target_user_id`, `status`),
  KEY `ix_guild_invites_inviter`       (`inviter_user_id`),
  CONSTRAINT `fk_guild_invites_guild`
    FOREIGN KEY (`guild_id`)         REFERENCES `guilds` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_guild_invites_target`
    FOREIGN KEY (`target_user_id`)   REFERENCES `users`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_guild_invites_inviter`
    FOREIGN KEY (`inviter_user_id`)  REFERENCES `users`  (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
