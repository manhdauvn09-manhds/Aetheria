// Aetheria — i18n message bundles.
//
// Compact, hand-rolled. No runtime dep on react-intl: bundles are
// imported as TS modules so misspelled keys break typecheck. Adding
// a new locale = add a constant + mention it in `LOCALES`.

export type Locale = "en" | "vi";
export const LOCALES: readonly Locale[] = ["en", "vi"];
export const DEFAULT_LOCALE: Locale = "en";

const en = {
  app: { title: "Aetheria", tagline: "Strategy, exploration, combat." },
  menu: {
    new_journey: "New Journey",
    continue: "Continue",
    roster: "Roster",
    quests: "Quests",
    battle_pass: "Battle Pass",
    guild: "Guild",
    friends: "Friends",
    chat: "Chat",
    pvp: "PvP",
    leaderboard: "Leaderboard",
    sign_out: "Sign out",
  },
  pvp: {
    queue: "Find match",
    cancel: "Cancel queue",
    your_move: "Your move",
    waiting: "Waiting…",
    surrender: "Surrender",
    victory: "Victory",
    defeat: "Defeat",
    draw: "Draw",
  },
} as const;

type Bundle = { [N in keyof typeof en]: { [K in keyof (typeof en)[N]]: string } };

const vi: Bundle = {
  app: { title: "Aetheria", tagline: "Chiến thuật, khám phá, chiến đấu." },
  menu: {
    new_journey: "Hành trình mới",
    continue: "Tiếp tục",
    roster: "Đội hình",
    quests: "Nhiệm vụ",
    battle_pass: "Battle Pass",
    guild: "Bang hội",
    friends: "Bạn bè",
    chat: "Trò chuyện",
    pvp: "PvP",
    leaderboard: "Bảng xếp hạng",
    sign_out: "Đăng xuất",
  },
  pvp: {
    queue: "Tìm trận",
    cancel: "Huỷ hàng đợi",
    your_move: "Lượt của bạn",
    waiting: "Đang chờ…",
    surrender: "Đầu hàng",
    victory: "Chiến thắng",
    defeat: "Thua cuộc",
    draw: "Hoà",
  },
};

export const messages: Record<Locale, Bundle> = { en, vi };
export type MessageBundle = Bundle;
export type MessageKey =
  | { [N in keyof MessageBundle]: `${N}.${string & keyof MessageBundle[N]}` }[keyof MessageBundle];
