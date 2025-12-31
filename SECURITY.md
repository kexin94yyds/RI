# Security Policy

## Overview

Replace-Information (RI) takes security seriously. This document outlines the security measures implemented in the application and how to report security vulnerabilities.

## Security Features

### 1. Cross-Site Scripting (XSS) Protection

The application implements comprehensive XSS protection:

- **HTML Sanitization**: All user-generated HTML content is sanitized before rendering using `sanitizeHtml()` function
- **URL Validation**: All URLs (including data URLs and file paths) are validated using `sanitizeUrl()` function
- **Attribute Escaping**: HTML attributes are properly escaped using `sanitizeAttribute()` function
- **Event Handler Removal**: All inline event handlers (onclick, onerror, etc.) are stripped from user content
- **Script Tag Removal**: Script tags are removed from rich text content

### 2. Content Security Policy (CSP)

Both `index.html` and `note-window.html` include strict Content Security Policy headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file:; font-src 'self'; connect-src 'self';
```

This prevents:
- Loading scripts from external sources
- Inline script execution (except for explicitly allowed areas)
- Unauthorized network connections

### 3. URL Validation for External Links

The `shell.openExternal` API includes strict validation:

- **Protocol Whitelist**: Only `http:`, `https:`, and `mailto:` protocols are allowed
- **Command Injection Prevention**: Shell metacharacters are blocked
- **Malicious URL Blocking**: javascript:, vbscript:, and data:text/html URLs are rejected

### 4. Electron Security Best Practices

The application follows Electron security best practices:

- **Context Isolation**: Enabled (`contextIsolation: true`)
- **Node Integration**: Disabled in renderer process (`nodeIntegration: false`)
- **Remote Module**: Disabled (`enableRemoteModule: false`)
- **Preload Script**: Uses secure IPC channel whitelist
- **Hardened Runtime**: Enabled for macOS builds

### 5. Dependency Security

- Regular dependency audits using `npm audit`
- Automatic security updates for non-breaking changes
- CodeQL security scanning enabled

## Secure Coding Practices

### Input Sanitization

All user inputs are sanitized before use:

```javascript
// Example: Sanitizing HTML content
const sanitizedHtml = sanitizeHtml(userContent);
element.innerHTML = sanitizedHtml;

// Example: Sanitizing URLs
const sanitizedUrl = sanitizeUrl(userUrl);
if (sanitizedUrl) {
  element.setAttribute('src', sanitizeAttribute(sanitizedUrl));
}
```

### IPC Channel Whitelisting

The preload script only exposes specific IPC channels:

```javascript
const validChannels = ['toggle-note-pin', 'modes-updated', 'mode-switched', 'note-saved'];
if (validChannels.includes(channel)) {
  ipcRenderer.send(channel, data);
}
```

## Known Limitations

1. **Rich Text Editor**: The application allows HTML content in the note editor. While sanitized, users should be cautious about pasting content from untrusted sources.

2. **File Protocol**: The application uses `file://` protocol for local images. This is necessary for functionality but is restricted to the application's data directory.

3. **Electron Version**: The application currently uses Electron 28.0.0. Updating to the latest version may introduce breaking changes and requires careful testing.

## Reporting Security Vulnerabilities

If you discover a security vulnerability in Replace-Information, please report it by:

1. **DO NOT** open a public issue
2. Email the maintainer directly (check the repository for contact information)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond to security reports within 48 hours and work to address the issue promptly.

## Security Updates

Security updates are released as follows:

- **Critical vulnerabilities**: Immediate patch release
- **High severity**: Within 7 days
- **Medium severity**: Within 30 days
- **Low severity**: Next scheduled release

## Security Audit History

- **2025-12-31**: Comprehensive security review and XSS protection implementation
  - Added HTML sanitization for rich text content
  - Implemented URL validation for external links
  - Added Content Security Policy headers
  - Fixed command injection vulnerabilities in shell.openExternal
  - CodeQL scan: 0 alerts

## Best Practices for Users

1. **Keep the application updated** to the latest version
2. **Be cautious** when pasting content from untrusted websites into the rich text editor
3. **Verify links** before clicking them (especially when shared by others)
4. **Report suspicious behavior** if you notice anything unusual

## License

This security policy is part of the Replace-Information project and is covered by the same ISC license.

---

Last Updated: 2025-12-31
