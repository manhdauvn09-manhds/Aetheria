-- Aetheria — MySQL bootstrap (run as root or DB admin)
-- Creates the shared database and the three application roles.
-- Idempotent: safe to re-run.

CREATE DATABASE IF NOT EXISTS `aetheria`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- Replace the passwords below before running in production.
CREATE USER IF NOT EXISTS 'aetheria_app'@'%'       IDENTIFIED BY 'change-me-app';
CREATE USER IF NOT EXISTS 'aetheria_readonly'@'%'  IDENTIFIED BY 'change-me-readonly';
CREATE USER IF NOT EXISTS 'aetheria_migrator'@'%'  IDENTIFIED BY 'change-me-migrator';

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON `aetheria`.* TO 'aetheria_app'@'%';
GRANT SELECT                                       ON `aetheria`.* TO 'aetheria_readonly'@'%';
GRANT ALL PRIVILEGES                              ON `aetheria`.* TO 'aetheria_migrator'@'%';

FLUSH PRIVILEGES;
