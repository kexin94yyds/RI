# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a Chrome extension called "单词记录器" (Word Recorder) that helps users save, manage, and review words from their clipboard. The extension supports multiple modes for organizing different types of vocabulary (e.g., English, Japanese, specialized terms).

## Development Commands

### Loading the Extension for Testing
```bash
# 1. Open Chrome and navigate to chrome://extensions/
# 2. Enable Developer Mode (top right toggle)
# 3. Click "Load unpacked" and select this project directory
# 4. The extension will appear in the browser toolbar
```

### File Validation
```bash
# Check if all required files are present
ls -la manifest.json popup.html popup.js background.js style.css *.png

# Validate JSON manifest
python -m json.tool manifest.json
```

### Testing the Extension
```bash
# Test keyboard shortcut: Cmd+U (Mac) or Ctrl+U (Windows)
# Test popup functionality by clicking the extension icon
# Test permissions by checking Chrome DevTools > Console for errors
```

## Architecture Overview

### Core Components

**Multi-Mode Storage System**
- Each mode has independent word lists stored using Chrome Storage API
- Modes are stored in `wordModes` array with structure: `{id, name, words}`
- Current active mode stored in `currentWordMode`
- Data persists locally in browser only

**Event-Driven Architecture**
- `background.js`: Service worker handling keyboard shortcuts and system notifications
- `popup.js`: Main UI logic with event delegation pattern for dynamic content
- Content script injection for clipboard access and page notifications

**State Management Pattern**
- Global state variables: `modes[]`, `currentMode`, editing states
- Centralized save/load functions: `saveModes()`, `loadModes()`
- UI synchronization via `updateModeUI()` after state changes

### File Structure
- `manifest.json` - Extension configuration with Manifest V3
- `popup.html/js/css` - Main interface (300px width popup)
- `background.js` - Service worker for keyboard shortcuts
- `icon*.png` - Extension icons (16px, 48px, 128px)

### Key Features Architecture

**Multi-Mode Management**
- Dropdown interface with add/edit/delete operations
- Modal dialog system for mode CRUD operations
- Automatic mode switching with data isolation

**Word Management**
- Inline editing with textarea expansion
- Import/export via TXT files with Blob API
- Review system with random word selection

**Keyboard Shortcuts**
- Chrome commands API integration
- Cross-platform key binding (Cmd/Ctrl+U)
- Content script injection for clipboard access

## Development Guidelines

### Chrome Extension Best Practices
- Uses Manifest V3 service workers (not background pages)
- Minimal permissions following principle of least privilege
- Async/await pattern for Chrome API calls

### UI/UX Patterns
- 300px width constraint for popup
- Progressive disclosure (collapsible sections)
- Inline editing with keyboard shortcuts (Ctrl+Enter to save, ESC to cancel)
- Modal dialogs for destructive operations

### Data Handling
- No external data transmission (local storage only)
- Graceful fallback for clipboard API failures
- Duplicate word prevention at mode level
- File export with mode-specific naming

### Error Handling
- Try-catch blocks around clipboard operations
- User-friendly error messages in Chinese
- Notification system for user feedback
- Graceful degradation when permissions unavailable

## Working with This Codebase

### Common Modification Patterns
- Add new mode functionality: Extend mode object structure and update CRUD operations
- Modify word operations: Update both `currentMode.words` and `modes` array consistently
- UI changes: Update HTML, add CSS classes, bind events in `setupEventListeners()`

### Testing Considerations
- Test keyboard shortcuts in different browser contexts
- Verify clipboard permissions across different websites
- Test import/export with various file formats
- Check mode switching preserves data integrity

### Debugging Tips
- Use Chrome DevTools Extensions panel for debugging
- Check Background page console for service worker issues
- Verify Storage API data in DevTools > Application > Storage
- Test on different websites for permission edge cases