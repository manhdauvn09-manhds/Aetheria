-- Aetheria — MySQL DDL (shared / server-side)
-- Spec: docs/02_DATABASE_DESIGN.md
-- Engine: InnoDB. Charset: utf8mb4 / utf8mb4_0900_ai_ci.
-- Run as `aetheria_migrator` against database `aetheria`.

USE `aetheria`;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ────────────────────────────────────────────────────────────────────
-- 2.1  Identity & Profile
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `users` (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email`             VARCHAR(255)    NOT NULL,
  `password_hash`     TEXT            NULL,
  `oauth_provider`    VARCHAR(32)     NULL,
  `oauth_subject`     VARCHAR(255)    NULL,
  `email_verified_at` DATETIME(3)     NULL,
  `status`            VARCHAR(16)     NOT NULL DEFAULT 'active',
  `created_at`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `last_login_at`     DATETIME(3)     NULL,
  `deleted_at`        DATETIME(3)     NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_oauth` (`oauth_provider`, `oauth_subject`),
  KEY `ix_users_email` (`email`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `profiles` (
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `display_name`   VARCHAR(64)     NOT NULL,
  `avatar_url`     VARCHAR(512)    NULL,
  `country`        VARCHAR(2)      NULL,
  `language`       VARCHAR(16)     NULL,
  `account_level`  INT             NOT NULL DEFAULT 1,
  `account_xp`     INT             NOT NULL DEFAULT 0,
  `gold`           INT             NOT NULL DEFAULT 0,
  `aether`         INT             NOT NULL DEFAULT 0,
  `preferences`    JSON            NOT NULL,
  `created_at`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_profiles_display_name` (`display_name`),
  CONSTRAINT `fk_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────────────
-- 2.2  Characters & Skills
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `characters` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `codename`           VARCHAR(32)     NOT NULL,
  `name`               VARCHAR(64)     NOT NULL,
  `class`              VARCHAR(32)     NOT NULL,
  `role`               VARCHAR(32)     NOT NULL,
  `base_stats`         JSON            NOT NULL,
  `art_url`            VARCHAR(512)    NULL,
  `lore`               TEXT            NULL,
  `unlock_requirement` JSON            NULL,
  `version`            INT             NOT NULL DEFAULT 1,
  `created_at`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_characters_codename` (`codename`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `skills` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `character_id` BIGINT UNSIGNED NOT NULL,
  `name`         VARCHAR(64)     NOT NULL,
  `type`         VARCHAR(16)     NOT NULL,
  `ap_cost`      INT             NOT NULL DEFAULT 0,
  `cooldown`     INT             NOT NULL DEFAULT 0,
  `effect`       JSON            NOT NULL,
  `icon_url`     VARCHAR(512)    NULL,
  `created_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_skills_character` (`character_id`),
  CONSTRAINT `fk_skills_character` FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `character_skills` (
  `character_id` BIGINT UNSIGNED NOT NULL,
  `slot`         INT             NOT NULL,
  `skill_id`     BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`character_id`, `slot`),
  KEY `ix_character_skills_skill` (`skill_id`),
  CONSTRAINT `fk_charskills_character` FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_charskills_skill`     FOREIGN KEY (`skill_id`)     REFERENCES `skills`(`id`)     ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `user_characters` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`            BIGINT UNSIGNED NOT NULL,
  `character_id`       BIGINT UNSIGNED NOT NULL,
  `ascension`          INT             NOT NULL DEFAULT 0,
  `xp`                 INT             NOT NULL DEFAULT 0,
  `equipped_skin_id`   BIGINT UNSIGNED NULL,
  `unlocked_at`        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_characters` (`user_id`, `character_id`),
  KEY `ix_user_characters_user` (`user_id`),
  CONSTRAINT `fk_uchar_user`      FOREIGN KEY (`user_id`)      REFERENCES `users`(`id`)      ON DELETE CASCADE,
  CONSTRAINT `fk_uchar_character` FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `user_skills` (
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `skill_id`    BIGINT UNSIGNED NOT NULL,
  `level`       INT             NOT NULL DEFAULT 1,
  `unlocked_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `skill_id`),
  CONSTRAINT `fk_uskills_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`(`id`)  ON DELETE CASCADE,
  CONSTRAINT `fk_uskills_skill` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────────────
-- 2.3  World Content
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `realms` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(64)     NOT NULL,
  `theme`       VARCHAR(64)     NOT NULL,
  `color_hex`   VARCHAR(8)      NOT NULL,
  `order_index` INT             NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `levels` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `realm_id`           BIGINT UNSIGNED NOT NULL,
  `level_number`       INT             NOT NULL,
  `name`               VARCHAR(128)    NOT NULL,
  `type`               VARCHAR(16)     NOT NULL,
  `map`                JSON            NOT NULL,
  `encounter`          JSON            NOT NULL,
  `rewards`            JSON            NOT NULL,
  `difficulty`         INT             NOT NULL DEFAULT 1,
  `min_account_level`  INT             NOT NULL DEFAULT 1,
  `discovery_secrets`  JSON            NULL,
  `version`            INT             NOT NULL DEFAULT 1,
  `created_at`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_levels_number` (`level_number`),
  KEY `ix_levels_realm` (`realm_id`),
  CONSTRAINT `fk_levels_realm` FOREIGN KEY (`realm_id`) REFERENCES `realms`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────────────
-- 2.4  Items & Inventory
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `items` (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`      VARCHAR(128)    NOT NULL,
  `tier`      VARCHAR(16)     NOT NULL,
  `type`      VARCHAR(16)     NOT NULL,
  `effect`    JSON            NOT NULL,
  `icon_url`  VARCHAR(512)    NULL,
  `max_stack` INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `inventory` (
  `id`                              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`                         BIGINT UNSIGNED NOT NULL,
  `item_id`                         BIGINT UNSIGNED NOT NULL,
  `quantity`                        INT             NOT NULL DEFAULT 1,
  `equipped_to_user_character_id`   BIGINT UNSIGNED NULL,
  `updated_at`                      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_user_item` (`user_id`, `item_id`),
  KEY `ix_inventory_user` (`user_id`),
  CONSTRAINT `fk_inv_user`     FOREIGN KEY (`user_id`)                       REFERENCES `users`(`id`)            ON DELETE CASCADE,
  CONSTRAINT `fk_inv_item`     FOREIGN KEY (`item_id`)                       REFERENCES `items`(`id`)            ON DELETE RESTRICT,
  CONSTRAINT `fk_inv_equipped` FOREIGN KEY (`equipped_to_user_character_id`) REFERENCES `user_characters`(`id`)  ON DELETE SET NULL
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────────────
-- 2.5  Runs & Save states
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `runs` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `level_id`   BIGINT UNSIGNED NOT NULL,
  `status`     VARCHAR(16)     NOT NULL,
  `started_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ended_at`   DATETIME(3)     NULL,
  `score`      INT             NOT NULL DEFAULT 0,
  `stars`      INT             NOT NULL DEFAULT 0,
  `action_log` JSON            NOT NULL,
  `snapshot`   JSON            NULL,
  PRIMARY KEY (`id`),
  KEY `ix_runs_user_status` (`user_id`, `status`),
  KEY `ix_runs_level` (`level_id`),
  CONSTRAINT `fk_runs_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`(`id`)  ON DELETE CASCADE,
  CONSTRAINT `fk_runs_level` FOREIGN KEY (`level_id`) REFERENCES `levels`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `save_states` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `slot`           INT             NOT NULL,
  `payload`        JSON            NOT NULL,
  `schema_version` INT             NOT NULL DEFAULT 1,
  `updated_at`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_save_states_user_slot` (`user_id`, `slot`),
  CONSTRAINT `fk_save_states_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────────────
-- 2.6  Quests / Battle pass
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `quests` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type`         VARCHAR(16)     NOT NULL,
  `requirements` JSON            NOT NULL,
  `rewards`      JSON            NOT NULL,
  `active_from`  DATETIME(3)     NOT NULL,
  `active_to`    DATETIME(3)     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_quests_type_active` (`type`, `active_from`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `user_quests` (
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `quest_id`   BIGINT UNSIGNED NOT NULL,
  `progress`   JSON            NOT NULL,
  `status`     VARCHAR(16)     NOT NULL DEFAULT 'active',
  `claimed_at` DATETIME(3)     NULL,
  `updated_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `quest_id`),
  KEY `ix_user_quests_user_status` (`user_id`, `status`),
  CONSTRAINT `fk_uquests_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`(`id`)  ON DELETE CASCADE,
  CONSTRAINT `fk_uquests_quest` FOREIGN KEY (`quest_id`) REFERENCES `quests`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `battle_pass_seasons` (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`      VARCHAR(64)     NOT NULL,
  `starts_at` DATETIME(3)     NOT NULL,
  `ends_at`   DATETIME(3)     NOT NULL,
  `tracks`    JSON            NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `battle_pass_progress` (
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `season_id`  BIGINT UNSIGNED NOT NULL,
  `tier`       INT             NOT NULL DEFAULT 0,
  `premium`    BOOLEAN         NOT NULL DEFAULT FALSE,
  `xp`         INT             NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `season_id`),
  CONSTRAINT `fk_bpp_user`   FOREIGN KEY (`user_id`)   REFERENCES `users`(`id`)               ON DELETE CASCADE,
  CONSTRAINT `fk_bpp_season` FOREIGN KEY (`season_id`) REFERENCES `battle_pass_seasons`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────────────
-- 2.7  Social
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `guilds` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`            VARCHAR(64)     NOT NULL,
  `tag`             VARCHAR(4)      NOT NULL,
  `description`     TEXT            NULL,
  `leader_user_id`  BIGINT UNSIGNED NOT NULL,
  `level`           INT             NOT NULL DEFAULT 1,
  `xp`              INT             NOT NULL DEFAULT 0,
  `created_at`      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_guilds_name` (`name`),
  UNIQUE KEY `uq_guilds_tag`  (`tag`),
  CONSTRAINT `fk_guilds_leader` FOREIGN KEY (`leader_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `guild_members` (
  `guild_id`     BIGINT UNSIGNED NOT NULL,
  `user_id`      BIGINT UNSIGNED NOT NULL,
  `role`         VARCHAR(16)     NOT NULL DEFAULT 'member',
  `joined_at`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `contribution` INT             NOT NULL DEFAULT 0,
  PRIMARY KEY (`guild_id`, `user_id`),
  KEY `ix_guild_members_user` (`user_id`),
  CONSTRAINT `fk_gm_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gm_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`(`id`)  ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `friendships` (
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `friend_id`  BIGINT UNSIGNED NOT NULL,
  `status`     VARCHAR(16)     NOT NULL DEFAULT 'pending',
  `created_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `friend_id`),
  KEY `ix_friendships_friend` (`friend_id`),
  CONSTRAINT `fk_fr_user`   FOREIGN KEY (`user_id`)   REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fr_friend` FOREIGN KEY (`friend_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `channel_type` VARCHAR(16)     NOT NULL,
  `channel_id`   BIGINT UNSIGNED NULL,
  `sender_id`    BIGINT UNSIGNED NOT NULL,
  `content`      TEXT            NOT NULL,
  `created_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `flagged`      BOOLEAN         NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  KEY `ix_chat_channel_time` (`channel_type`, `channel_id`, `created_at`),
  KEY `ix_chat_created`      (`created_at`),
  CONSTRAINT `fk_chat_sender` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;
-- NOTE: post-MVP, partition by RANGE(YEAR(created_at)*100 + MONTH(created_at)).

-- ────────────────────────────────────────────────────────────────────
-- 2.8  PvP & Ranking
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `pvp_matches` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `mode`            VARCHAR(8)      NOT NULL,
  `status`          VARCHAR(16)     NOT NULL,
  `started_at`      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ended_at`        DATETIME(3)     NULL,
  `winner_user_id`  BIGINT UNSIGNED NULL,
  `region`          VARCHAR(16)     NOT NULL,
  `server_seed`     VARBINARY(64)   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_pvp_matches_mode_time` (`mode`, `started_at`),
  CONSTRAINT `fk_pvp_winner` FOREIGN KEY (`winner_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `pvp_match_players` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `match_id`   BIGINT UNSIGNED NOT NULL,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `lineup`     JSON            NOT NULL,
  `score`      INT             NOT NULL DEFAULT 0,
  `mmr_before` INT             NOT NULL,
  `mmr_after`  INT             NOT NULL,
  `result`     VARCHAR(8)      NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pvp_match_user` (`match_id`, `user_id`),
  KEY `ix_pvp_player_user` (`user_id`),
  CONSTRAINT `fk_pmp_match` FOREIGN KEY (`match_id`) REFERENCES `pvp_matches`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pmp_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`(`id`)       ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `mmr` (
  `user_id`      BIGINT UNSIGNED NOT NULL,
  `mode`         VARCHAR(8)      NOT NULL,
  `mmr`          INT             NOT NULL DEFAULT 1000,
  `rd`           DOUBLE          NOT NULL DEFAULT 350.0,
  `volatility`   DOUBLE          NOT NULL DEFAULT 0.06,
  `peak_mmr`     INT             NOT NULL DEFAULT 1000,
  `season_games` INT             NOT NULL DEFAULT 0,
  `season_wins`  INT             NOT NULL DEFAULT 0,
  `updated_at`   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`, `mode`),
  CONSTRAINT `fk_mmr_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `leaderboards` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `mode`        VARCHAR(8)      NOT NULL,
  `season_id`   BIGINT UNSIGNED NOT NULL,
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `rank`        INT             NOT NULL,
  `score`       INT             NOT NULL,
  `snapshot_at` DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_leaderboard_entry` (`mode`, `season_id`, `user_id`),
  KEY `ix_leaderboard_rank` (`mode`, `season_id`, `rank`)
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────────────
-- 2.9  Marketplace
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `shop_items` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_id`        BIGINT UNSIGNED NOT NULL,
  `currency_type`  VARCHAR(8)      NOT NULL,
  `price`          INT             NOT NULL,
  `available_from` DATETIME(3)     NOT NULL,
  `available_to`   DATETIME(3)     NOT NULL,
  `stock`          INT             NULL,
  PRIMARY KEY (`id`),
  KEY `ix_shop_window` (`available_from`, `available_to`),
  CONSTRAINT `fk_shop_item` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NOT NULL,
  `shop_item_id`  BIGINT UNSIGNED NOT NULL,
  `currency_type` VARCHAR(8)      NOT NULL,
  `amount`        INT             NOT NULL,
  `status`        VARCHAR(16)     NOT NULL,
  `created_at`    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_tx_user_time` (`user_id`, `created_at`),
  CONSTRAINT `fk_tx_user` FOREIGN KEY (`user_id`)      REFERENCES `users`(`id`)      ON DELETE CASCADE,
  CONSTRAINT `fk_tx_shop` FOREIGN KEY (`shop_item_id`) REFERENCES `shop_items`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ────────────────────────────────────────────────────────────────────
-- 2.10 System
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_user_id`  BIGINT UNSIGNED NULL,
  `action`         VARCHAR(64)     NOT NULL,
  `target_type`    VARCHAR(64)     NOT NULL,
  `target_id`      BIGINT UNSIGNED NULL,
  `payload`        JSON            NOT NULL,
  `ip`             VARCHAR(45)     NULL,
  `user_agent`     VARCHAR(512)    NULL,
  `created_at`     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_audit_created`    (`created_at`),
  KEY `ix_audit_actor_time` (`actor_user_id`, `created_at`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;
-- NOTE: post-MVP, partition by RANGE(YEAR(created_at)*100 + MONTH(created_at)).

CREATE TABLE IF NOT EXISTS `feature_flags` (
  `key`        VARCHAR(128) NOT NULL,
  `value`      JSON         NOT NULL,
  `updated_by` VARCHAR(128) NULL,
  `updated_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB;

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

SET FOREIGN_KEY_CHECKS = 1;
