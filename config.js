// =====================================================================
//  How was the WC?  —  instellingen
//  Dit is het enige bestand dat je hoeft aan te passen.
// =====================================================================

export const CONFIG = {
  // Uit Supabase > Project Settings > API (of "Connect").
  // Leeg laten = demomodus (alles blijft alleen op je eigen toestel).
  SUPABASE_URL: "https://fxfqeqjgxdmwmakdjrbk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_YbS_jaavTHiPSuRkUowr0A_NwiOqBm9",

  // Waar zijn de wc's? Leeg laten ([]) als je dit niet wilt vragen.
  LOCATIONS: ["5e verdieping", "6e verdieping", "Ander gebouw"],

  // Soort wc. Leeg laten ([]) als je dit niet wilt vragen.
  WC_TYPES: ["Heren", "Dames", "Invalide"],

  // Moet er altijd een foto bij een melding?
  PHOTO_REQUIRED: true,

  // Categorieën. 'id' nooit meer wijzigen als er al meldingen zijn;
  // label, emoji, titel, kleur en punten mag je altijd aanpassen.
  CATEGORIES: [
    { id: "remsporen", emoji: "💩", label: "Remsporen",       title: "Remspoor-Rechercheur", color: "#8a5a3b", points: 1 },
    { id: "bril",      emoji: "🚽", label: "Vieze wc-bril",   title: "Bril-Brigadier",       color: "#2f7fb8", points: 1 },
    { id: "plas",      emoji: "💦", label: "Plas naast de wc", title: "Plassen-Patrouille",  color: "#c9a400", points: 1 },
    { id: "wasbak",    emoji: "🚰", label: "Vieze wasbak",    title: "Wasbak-Waakhond",      color: "#2a9d8f", points: 1 },
    { id: "haar",      emoji: "➰", label: "Schaamhaar",      title: "Krullen-Commissaris",  color: "#9b4dca", points: 1 },
  ],
};
