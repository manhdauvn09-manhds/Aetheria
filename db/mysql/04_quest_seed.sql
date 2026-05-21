-- Aetheria — daily/weekly quest seed.
--
-- Idempotent: uses INSERT IGNORE so re-running is safe. Window is
-- intentionally wide (1990..2099) so quests stay always-active without
-- needing a cron to rotate them. True daily reset (per-user, per-day)
-- can be added later by widening UserQuest with a `claimed_for_day`
-- discriminator or by having a worker repopulate the catalog nightly.

USE `aetheria`;

INSERT IGNORE INTO `quests` (`id`, `type`, `requirements`, `rewards`, `active_from`, `active_to`) VALUES
  (
    1001,
    'daily',
    JSON_OBJECT('kind', 'complete_levels', 'count', 1),
    JSON_ARRAY(JSON_OBJECT('kind', 'xp', 'amount', 50)),
    '1990-01-01 00:00:00.000',
    '2099-12-31 23:59:59.000'
  ),
  (
    1002,
    'daily',
    JSON_OBJECT('kind', 'defeat_enemies', 'count', 3),
    JSON_ARRAY(JSON_OBJECT('kind', 'xp', 'amount', 30)),
    '1990-01-01 00:00:00.000',
    '2099-12-31 23:59:59.000'
  ),
  (
    1003,
    'daily',
    JSON_OBJECT('kind', 'finish_runs', 'count', 2, 'status', 'completed'),
    JSON_ARRAY(JSON_OBJECT('kind', 'xp', 'amount', 75)),
    '1990-01-01 00:00:00.000',
    '2099-12-31 23:59:59.000'
  ),
  (
    1004,
    'weekly',
    JSON_OBJECT('kind', 'complete_levels', 'count', 10),
    JSON_ARRAY(JSON_OBJECT('kind', 'xp', 'amount', 300)),
    '1990-01-01 00:00:00.000',
    '2099-12-31 23:59:59.000'
  ),
  (
    1005,
    'weekly',
    JSON_OBJECT('kind', 'defeat_enemies', 'count', 25),
    JSON_ARRAY(JSON_OBJECT('kind', 'xp', 'amount', 200)),
    '1990-01-01 00:00:00.000',
    '2099-12-31 23:59:59.000'
  );
