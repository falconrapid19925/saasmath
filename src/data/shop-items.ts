/**
 * Launch shop catalogue (plan section 4.3 / 5): a dozen cheap avatar and
 * room cosmetics, stars priced. One free starter avatar is granted to every
 * new child by the signup flow; the demo seed grants it too.
 */

import type { ShopItemKind } from "../db/schema";

export type ShopItemSpec = {
  /** Stable id, e.g. "avatar-kucing". */
  id: string;
  /** Display name in Bahasa Indonesia. */
  nameId: string;
  kind: ShopItemKind;
  /** Price in stars; 0 = starter/free item. */
  priceStars: number;
  /** Visual payload rendered by the shop UI. */
  emojiOrColor: { emoji?: string; color?: string };
};

export const SHOP_ITEM_SPECS: ShopItemSpec[] = [
  { id: "avatar-kucing", nameId: "Avatar Kucing", kind: "avatar", priceStars: 0, emojiOrColor: { emoji: "🐱" } },
  { id: "avatar-kelinci", nameId: "Avatar Kelinci", kind: "avatar", priceStars: 30, emojiOrColor: { emoji: "🐰" } },
  { id: "avatar-panda", nameId: "Avatar Panda", kind: "avatar", priceStars: 50, emojiOrColor: { emoji: "🐼" } },
  { id: "avatar-rubah", nameId: "Avatar Rubah", kind: "avatar", priceStars: 80, emojiOrColor: { emoji: "🦊" } },
  { id: "avatar-burung-hantu", nameId: "Avatar Burung Hantu", kind: "avatar", priceStars: 100, emojiOrColor: { emoji: "🦉" } },
  { id: "avatar-naga", nameId: "Avatar Naga", kind: "avatar", priceStars: 150, emojiOrColor: { emoji: "🐉" } },
  { id: "room-langit", nameId: "Langit Biru", kind: "room", priceStars: 20, emojiOrColor: { color: "#7dd3fc" } },
  { id: "room-hutan", nameId: "Ruang Hutan", kind: "room", priceStars: 40, emojiOrColor: { color: "#4ade80" } },
  { id: "room-pantai", nameId: "Ruang Pantai", kind: "room", priceStars: 60, emojiOrColor: { color: "#fbbf24" } },
  { id: "room-angkasa", nameId: "Ruang Angkasa", kind: "room", priceStars: 90, emojiOrColor: { color: "#312e81" } },
  { id: "room-perpustakaan", nameId: "Ruang Perpustakaan", kind: "room", priceStars: 90, emojiOrColor: { color: "#b45309" } },
  { id: "room-pelangi", nameId: "Ruang Pelangi", kind: "room", priceStars: 120, emojiOrColor: { color: "#f472b6" } },
];

/** Starter avatar granted at signup (price 0). */
export const STARTER_AVATAR_ID = "avatar-kucing";
