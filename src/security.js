// src/security.js - Shared security utilities

/**
 * Sanitize URL to prevent XSS and command injection
 * @param {string} url - URL to sanitize
 * @returns {string} - Sanitized URL or empty string if invalid
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  
  // Remove any whitespace and control characters
  url = url.trim().replace(/[\x00-\x1F\x7F]/g, '');
  
  // Only allow http, https, data (for images), file, and mailto protocols
  const allowedProtocols = /^(https?|data|file|mailto):/i;
  
  // Check if URL has a protocol
  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(url);
  
  if (hasProtocol) {
    // Validate that the protocol is allowed
    if (!allowedProtocols.test(url)) {
      console.warn('Blocked URL with disallowed protocol:', url);
      return '';
    }
    
    // Block javascript: and data: URIs that could execute scripts
    if (/^(javascript|vbscript|data:text\/html)/i.test(url)) {
      console.warn('Blocked potentially malicious URL:', url);
      return '';
    }
  }
  
  // For data URLs, validate the format
  if (url.startsWith('data:')) {
    // Only allow image data URLs with base64 encoding
    if (!/^data:image\/(png|jpeg|jpg|gif|webp|bmp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(url)) {
      console.warn('Blocked invalid data URL:', url.substring(0, 50) + '...');
      return '';
    }
  }
  
  return url;
}

/**
 * Sanitize attribute value to prevent XSS
 * @param {string} value - Attribute value to sanitize
 * @returns {string} - Escaped attribute value
 */
export function sanitizeAttribute(value) {
  if (!value || typeof value !== 'string') return '';
  
  // Escape quotes and other potentially dangerous characters
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize HTML content for rich text editing
 * This allows safe HTML tags but removes dangerous attributes and scripts
 * @param {string} html - HTML content to sanitize
 * @returns {string} - Sanitized HTML
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  
  const div = document.createElement('div');
  div.innerHTML = html;
  
  // Remove script tags
  const scripts = div.querySelectorAll('script');
  scripts.forEach(script => script.remove());
  
  // Remove event handler attributes from all elements
  const allElements = div.querySelectorAll('*');
  allElements.forEach(el => {
    // Remove all event handler attributes (onclick, onerror, etc.)
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });
    
    // Sanitize href and src attributes
    if (el.hasAttribute('href')) {
      const href = el.getAttribute('href');
      const sanitized = sanitizeUrl(href);
      if (sanitized) {
        el.setAttribute('href', sanitized);
      } else {
        el.removeAttribute('href');
      }
    }
    
    if (el.hasAttribute('src')) {
      const src = el.getAttribute('src');
      const sanitized = sanitizeUrl(src);
      if (sanitized) {
        el.setAttribute('src', sanitized);
      } else {
        el.removeAttribute('src');
      }
    }
  });
  
  return div.innerHTML;
}
