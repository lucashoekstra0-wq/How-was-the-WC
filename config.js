// =====================================================================
//  How was the WC?  —  instellingen
// =====================================================================

export const CONFIG = {
  // Supabase (Project Settings > API). Leeg = demomodus op dit toestel.
  SUPABASE_URL: "https://fxfqeqjgxdmwmakdjrbk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_YbS_jaavTHiPSuRkUowr0A_NwiOqBm9",

  // Openbare sleutel voor pushmeldingen (hoort bij de pushmeldingen-functie).
  VAPID_PUBLIC_KEY: "BGAhpRW6Z6wL2JL-sk0JxMUGKIKp3isCqfIH-YQylqDP3zRmfZE-01C0uZzZ9I7tiyKPXG0ytmCA8X1Pr8IPj5w",

  // Waar zijn de wc's, en welke soorten? De eerste is steeds de standaard.
  LOCATIONS: ["6e verdieping", "5e verdieping", "Ander gebouw"],
  WC_TYPES: ["Heren", "Dames", "Invalide"],
  DEFAULT_LOCATION: "6e verdieping",
  DEFAULT_WC_TYPE: "Heren",

  // Moet er altijd een foto bij een melding?
  PHOTO_REQUIRED: true,

  // Verdachten: minimaal aantal stemmen voordat er een uitspraak is.
  SUSPECT_MIN_VOTES: 2,

  // Emoji-reacties onder een melding
  REACTIONS: ["🤢", "😂", "🫡", "🕵️", "🧽"],

  // Categorieën. 'id' nooit meer wijzigen als er al meldingen zijn;
  // label, emoji, titel, kleur en punten mag je altijd aanpassen.
  CATEGORIES: [
    { id: "remsporen",  emoji: "💩", label: "Remsporen",          title: "Remspoor-Rechercheur", color: "#8a5a3b", points: 1 },
    { id: "bril",       emoji: "🚽", label: "Vieze wc-bril",      title: "Bril-Brigadier",       color: "#2f7fb8", points: 1 },
    { id: "plas",       emoji: "💦", label: "Plas naast de wc",   title: "Plassen-Patrouille",   color: "#c9a400", points: 1 },
    { id: "wasbak",     emoji: "🚰", label: "Vieze wasbak",       title: "Wasbak-Waakhond",      color: "#2a9d8f", points: 1 },
    { id: "haar",       emoji: "➰", label: "Schaamhaar",         title: "Krullen-Commissaris",  color: "#9b4dca", points: 1 },
    { id: "borstel",    emoji: "🧹", label: "Vieze wc-borstel",   title: "Borstel-Baas",         color: "#6d7f2e", points: 1 },
    { id: "doortrekken",emoji: "🚿", label: "Niet doorgetrokken", title: "Doortrek-Detective",   color: "#3b6fd6", points: 1 },
    { id: "stank",      emoji: "👃", label: "Stankbom",           title: "Neus-Agent",           color: "#c2573a", points: 1 },
    { id: "prullenbak", emoji: "🗑️", label: "Prullenbak vol",     title: "Afval-Agent",          color: "#5f6b73", points: 1 },
  ],
};
