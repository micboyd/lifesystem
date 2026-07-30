/**
 * Curated Font Awesome icons offered in the habit icon picker. Kept to a
 * habit-relevant spread (fitness, mind, learning, health, home, hobbies) so the
 * grid stays browsable rather than exhaustive.
 */
export const HABIT_ICONS: string[] = [
    'fa-solid fa-dumbbell',
    'fa-solid fa-person-running',
    'fa-solid fa-person-walking',
    'fa-solid fa-person-swimming',
    'fa-solid fa-bicycle',
    'fa-solid fa-heart-pulse',
    'fa-solid fa-spa',
    'fa-solid fa-person-praying',
    'fa-solid fa-brain',
    'fa-solid fa-book',
    'fa-solid fa-pen-nib',
    'fa-solid fa-language',
    'fa-solid fa-code',
    'fa-solid fa-graduation-cap',
    'fa-solid fa-music',
    'fa-solid fa-guitar',
    'fa-solid fa-palette',
    'fa-solid fa-camera',
    'fa-solid fa-droplet',
    'fa-solid fa-pills',
    'fa-solid fa-apple-whole',
    'fa-solid fa-carrot',
    'fa-solid fa-tooth',
    'fa-solid fa-bed',
    'fa-solid fa-utensils',
    'fa-solid fa-mug-hot',
    'fa-solid fa-broom',
    'fa-solid fa-piggy-bank',
    'fa-solid fa-mobile-screen-button',
    'fa-solid fa-pump-soap',
    'fa-solid fa-hands-praying',
    'fa-solid fa-sun',
    'fa-solid fa-leaf',
    'fa-solid fa-seedling',
    'fa-solid fa-dog',
    'fa-solid fa-star',
    'fa-solid fa-heart',
    'fa-solid fa-check',
]

/** Keyword → icon rules for habits that haven't picked an icon explicitly. */
const ICON_RULES: { icon: string; keywords: string[] }[] = [
    { icon: 'fa-solid fa-dumbbell', keywords: ['gym', 'workout', 'exercise', 'train', 'lift', 'weights'] },
    { icon: 'fa-solid fa-person-running', keywords: ['run', 'jog', 'cardio', '5k', '10k'] },
    { icon: 'fa-solid fa-person-walking', keywords: ['walk', 'steps', 'stroll'] },
    { icon: 'fa-solid fa-person-swimming', keywords: ['swim'] },
    { icon: 'fa-solid fa-bicycle', keywords: ['cycle', 'bike', 'cycling'] },
    { icon: 'fa-solid fa-spa', keywords: ['meditat', 'mindful', 'breath', 'calm'] },
    { icon: 'fa-solid fa-person-praying', keywords: ['yoga', 'stretch', 'pilates'] },
    { icon: 'fa-solid fa-book', keywords: ['read', 'book', 'study', 'revise'] },
    { icon: 'fa-solid fa-pen-nib', keywords: ['journal', 'write', 'diary', 'blog'] },
    { icon: 'fa-solid fa-language', keywords: ['language', 'spanish', 'french', 'german', 'duolingo', 'learn'] },
    { icon: 'fa-solid fa-code', keywords: ['code', 'program', 'leetcode', 'dev'] },
    { icon: 'fa-solid fa-music', keywords: ['music', 'guitar', 'piano', 'practice', 'sing'] },
    { icon: 'fa-solid fa-droplet', keywords: ['water', 'hydrate', 'drink'] },
    { icon: 'fa-solid fa-pills', keywords: ['vitamin', 'pill', 'meds', 'medic', 'supplement'] },
    { icon: 'fa-solid fa-tooth', keywords: ['floss', 'teeth', 'brush', 'dental'] },
    { icon: 'fa-solid fa-bed', keywords: ['sleep', 'bed', 'wake', 'rest'] },
    { icon: 'fa-solid fa-utensils', keywords: ['cook', 'meal', 'eat', 'breakfast', 'lunch', 'dinner'] },
    { icon: 'fa-solid fa-apple-whole', keywords: ['fruit', 'veg', 'healthy', 'diet'] },
    { icon: 'fa-solid fa-broom', keywords: ['clean', 'tidy', 'chore', 'wash'] },
    { icon: 'fa-solid fa-piggy-bank', keywords: ['save', 'budget', 'money', 'no spend'] },
    { icon: 'fa-solid fa-mobile-screen-button', keywords: ['phone', 'screen', 'social', 'scroll'] },
    { icon: 'fa-solid fa-pump-soap', keywords: ['skin', 'skincare', 'shower', 'groom'] },
    { icon: 'fa-solid fa-hands-praying', keywords: ['pray', 'gratitude', 'faith', 'church'] },
    { icon: 'fa-solid fa-mug-hot', keywords: ['coffee', 'tea', 'no caffeine'] },
    { icon: 'fa-solid fa-sun', keywords: ['sun', 'outside', 'daylight', 'fresh air'] },
]

/**
 * The icon to render for a habit: its explicitly chosen `icon` if set, else a
 * keyword match on the name, else a sprout (the "growing a habit" fallback).
 */
export function iconForHabit(name: string, icon?: string): string {
    if (icon) return icon
    const n = name.toLowerCase()
    for (const rule of ICON_RULES) {
        if (rule.keywords.some((k) => n.includes(k))) return rule.icon
    }
    return 'fa-solid fa-seedling'
}
