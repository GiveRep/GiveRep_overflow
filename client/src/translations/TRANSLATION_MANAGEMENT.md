# Translation Management Guide

## Overview
This guide helps manage the internationalization (i18n) implementation for the GiveRep application using react-i18next.

## Supported Languages (26 Total - All Complete)

1. **English (en)** - Default language
2. **简体中文 (zh-CN)** - Simplified Chinese
3. **繁體中文 (zh-TW)** - Traditional Chinese  
4. **日本語 (ja)** - Japanese
5. **한국어 (ko)** - Korean
6. **Español (es)** - Spanish
7. **Français (fr)** - French
8. **Deutsch (de)** - German
9. **Português (pt)** - Portuguese
10. **Italiano (it)** - Italian
11. **Русский (ru)** - Russian
12. **हिन्दी (hi)** - Hindi
13. **العربية (ar)** - Arabic (RTL)
14. **Nederlands (nl)** - Dutch
15. **Svenska (sv)** - Swedish
16. **Dansk (da)** - Danish
17. **Suomi (fi)** - Finnish
18. **Norsk (no)** - Norwegian
19. **Polski (pl)** - Polish
20. **Türkçe (tr)** - Turkish
21. **ไทย (th)** - Thai
22. **Tiếng Việt (vi)** - Vietnamese
23. **Bahasa Melayu (ms)** - Malay
24. **Bahasa Indonesia (id)** - Indonesian
25. **Filipino (fil)** - Filipino
26. **Ελληνικά (el)** - Greek

## File Structure
```
client/src/translations/
├── i18n.ts                    # i18n configuration and initialization
├── languages.ts               # Language configuration and metadata
├── en.json                    # English translations
├── ar.json                    # Arabic translations (RTL)
├── da.json                    # Danish translations
├── es.json                    # Spanish translations
├── fr.json                    # French translations
├── de.json                    # German translations
├── zh-CN.json                 # Simplified Chinese translations
├── zh-TW.json                 # Traditional Chinese translations
├── ja.json                    # Japanese translations
├── ko.json                    # Korean translations
├── fi.json                    # Finnish translations
├── [other language files]     # 15+ additional language files
├── translation-progress.md    # Progress tracker for component translations
└── TRANSLATION_MANAGEMENT.md  # This file - translation management guide
```

## Translation Key Structure

### Naming Convention
Keys follow a hierarchical structure:
- `section.subsection.item`
- Use camelCase for multi-word keys
- Group related translations together

### Current Structure
```json
{
  "nav": {                    // Navigation items
    "home": "Home",
    "leaderboard": "Leaderboard",
    "mindshare": "Mindshare",
    // ...
  },
  "buttons": {                // Common button texts
    "connectTwitter": "Connect Twitter",
    "connectWallet": "Connect Wallet",
    // ...
  },
  "common": {                 // Common UI elements
    "loading": "Loading...",
    "error": "Error",
    // ...
  },
  "wallet": {                 // Wallet-related texts
    "connected": "Connected",
    "balance": "Balance",
    // ...
  },
  "twitter": {                // Twitter-related texts
    "login": "Login with Twitter",
    "followers": "Followers",
    // ...
  },
  "home": {                   // Home page specific
    "tagline": "Track engagement...",
    "reputation": "Reputation",
    // ...
  },
  // Additional pages...
}
```

## Critical Translation Rules

### ⚠️ IMPORTANT: English-First Translation Workflow
When making text changes in the application:
1. **ONLY update the English file (en.json)** - Do NOT update other language files
2. **Translation sync will happen later** - The user will handle syncing to other languages
3. **Use translation keys properly** - Never hardcode text in components

### Why English-Only Updates?
- Prevents incorrect or machine-translated text in other languages
- Allows for proper professional translation later
- Keeps the codebase clean and maintainable
- Avoids incomplete translations that could break the user experience

### Translation Update Workflow
- [ ] Update ONLY `en.json` with new/changed text
- [ ] Use the translation key in your component: `{t('section.key')}`
- [ ] Do NOT update other language files (zh-CN.json, es.json, etc.)
- [ ] Mark any new keys with comments if needed for future translation

## How to Add New Translations

### 1. Add Translation Keys to English File Only
Add the new key-value pairs to ONLY the English file (`en.json`):

```json
// en.json
{
  "section": {
    "newKey": "English text"
  }
}

// DO NOT UPDATE OTHER LANGUAGE FILES
// Other languages will be synced later by the translation team
```

**Note**: Other language files will temporarily show the English text as fallback until translations are synced.

### 2. Use in Component
Import and use the translation hook:

```typescript
import { useTranslation } from 'react-i18next';

export function MyComponent() {
  const { t } = useTranslation();
  
  return <div>{t('section.newKey')}</div>;
}
```

### 3. Update Progress Tracker
Update `translation-progress.md` to mark the component as translated.

## Best Practices

### 1. Consistency
- Use consistent terminology across translations
- "@GiveRep" should always be capitalized as shown
- Keep technical terms in English when appropriate

### 2. Context-Aware Translations
- Consider the context where text appears
- Button text should be concise
- Error messages should be helpful and clear

### 3. Dynamic Content
For dynamic content with variables:

```typescript
// Translation file
"welcome": "Welcome, {{name}}!"

// Component
t('welcome', { name: userName })
```

### 4. Pluralization
For plural forms:

```typescript
// Translation file
"itemCount": {
  "one": "{{count}} item",
  "other": "{{count}} items"
}

// Component
t('itemCount', { count: 5 })
```

## Common Issues and Solutions

### Issue: Translation not showing
- Check if component imports `useTranslation`
- Verify translation key exists in **ALL** language files (not just one!)
- Ensure i18n is initialized in main.tsx

### Issue: Language not persisting
- Check localStorage for 'i18nextLng' key
- Verify LanguageDetector is configured

### Issue: Missing translations
- Check console for missing key warnings
- Add missing keys to **ALL** translation files
- Never add keys to just one language file

### Common Mistakes to Avoid
1. **Updating only English** - Always update Chinese translations too
2. **Hardcoding text** - Always use translation keys in components
3. **Inconsistent keys** - Keep the same key structure across all languages
4. **Forgetting special characters** - Ensure Chinese translations use proper punctuation (。，！？)
5. **Missing context** - Provide context for translators when text is ambiguous

## Testing Translations

### Manual Testing
1. Use the language switcher in the navbar
2. Check all pages and components
3. Verify text doesn't overflow UI elements

### Automated Checks
Run the translation extraction script:
```bash
npm run extract-translations
```

## Translation Progress

See `translation-progress.md` for detailed component-by-component progress.

### Priority Order
1. User-facing navigation and common UI
2. Main pages (Home, Profile, Leaderboard)
3. Feature pages (Loyalty, Mindshare)
4. Admin and settings pages
5. Error messages and edge cases

## RTL Language Support

### Supported RTL Languages
- **Arabic (ar)** - Fully supported with automatic layout mirroring

### How RTL Works
1. When Arabic is selected, the document direction is automatically set to RTL
2. CSS styles are automatically adjusted for RTL layout
3. Components maintain proper alignment and flow

### RTL Implementation Details
- Document direction is set via `document.documentElement.dir`
- CSS adjustments in `index.css` handle layout mirroring
- Tailwind classes are automatically reversed for RTL

## Future Enhancements

### Planned Features
- [ ] Add more languages (Traditional Chinese, Japanese, Korean)
- [ ] Implement number and date formatting
- [x] Add RTL language support (Arabic - completed)
- [ ] Create translation validation scripts
- [ ] Set up translation management platform integration

### Considerations
- Keep bundle size in mind when adding languages
- Consider lazy loading translations for large apps
- Plan for professional translation review## Translation Completion Status

### ✅ All 26 Languages Are Now Complete

Every language file contains complete translations for:
- ✅ Navigation menu items
- ✅ Buttons and common UI elements  
- ✅ Home page content and features
- ✅ Profile pages and reputation system
- ✅ Leaderboard sections
- ✅ Mindshare dashboard
- ✅ Loyalty programs
- ✅ Error messages and notifications
- ✅ Wallet integration
- ✅ Twitter/X integration
- ✅ All dynamic content with proper interpolation

### Language File Sizes
All translation files are comprehensive and contain the same structure as en.json, ensuring consistency across the application.
