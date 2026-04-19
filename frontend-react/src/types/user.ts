// ── Preference option constants — mirrors backend ALLOWED_* sets ──────────

export const GENRE_OPTIONS = [
  'Fantasy', 'Sci-Fi', 'Romance', 'Thriller', 'Mystery',
  'Literary Fiction', 'Historical', 'Magical Realism',
  'Horror', 'Comedy', 'Dystopian', 'YA',
] as const;

export const TONE_OPTIONS = [
  'Whimsical', 'Dark', 'Hopeful', 'Melancholic',
  'Epic', 'Intimate', 'Philosophical', 'Adventurous',
] as const;

export const THEME_OPTIONS = [
  'Coming-of-age', 'Redemption', 'Love', 'Grief',
  'Identity', 'Family', 'Power', 'Wonder', 'Survival', 'Friendship',
] as const;

export const ATMOSPHERE_OPTIONS = [
  'Enchanted forests', 'Deep space', 'Bustling cities',
  'Remote villages', 'Victorian drawing rooms',
  'Rainy noir streets', 'Coastal towns', 'Desert ruins',
] as const;

export const AUTHOR_SUGGESTIONS = [
  'Neil Gaiman',
  'Haruki Murakami',
  'Stephen King',
  'Ursula K. Le Guin',
  'Brandon Sanderson',
  'Toni Morrison',
  'Jane Austen',
  'Agatha Christie',
  'George R.R. Martin',
  'Margaret Atwood',
  'Kazuo Ishiguro',
  'Donna Tartt',
  'Cormac McCarthy',
  'Octavia Butler',
  'Terry Pratchett',
  'Isaac Asimov',
  'Virginia Woolf',
  'Gabriel García Márquez',
  'Leo Tolstoy',
  'J.R.R. Tolkien',
] as const;

export type Genre = typeof GENRE_OPTIONS[number];
export type Tone = typeof TONE_OPTIONS[number];
export type Theme = typeof THEME_OPTIONS[number];
export type Atmosphere = typeof ATMOSPHERE_OPTIONS[number];

// ── Core models — mirror backend UserPreferences and UserProfileResponse ──

export interface UserPreferences {
  favorite_genres: string[];
  favorite_authors: string[];  // max 5
  favorite_books: string[];    // max 5
  tones: string[];
  themes: string[];
  atmospheres: string[];
}

export interface UserProfile {
  uid: string;
  display_name: string | null;
  email: string | null;
  photo_url: string | null;
  onboarded_at: string | null;  // ISO timestamp; null = wizard not completed
  preferences: UserPreferences;
}

// ── Request bodies ─────────────────────────────────────────────────────────

export interface UpsertUserRequest {
  display_name?: string | null;
  photo_url?: string | null;
  preferences: UserPreferences;
}

export interface OnboardingCompleteRequest {
  preferences: UserPreferences;
}

// ── Utility ────────────────────────────────────────────────────────────────

export function emptyPreferences(): UserPreferences {
  return {
    favorite_genres: [],
    favorite_authors: [],
    favorite_books: [],
    tones: [],
    themes: [],
    atmospheres: [],
  };
}

export function hasNoMeaningfulPrefs(prefs: UserPreferences): boolean {
  return (
    prefs.favorite_genres.length === 0 &&
    prefs.favorite_authors.length === 0 &&
    prefs.favorite_books.length === 0 &&
    prefs.tones.length === 0 &&
    prefs.themes.length === 0 &&
    prefs.atmospheres.length === 0
  );
}
