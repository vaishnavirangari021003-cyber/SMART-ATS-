

const HF = {
  handlers: Object.create(null),
  views: Object.create(null),
  titles: Object.create(null),
  location: { pathname: '/index.html', search: '', hash: '', href: '/index.html' },
  _rendering: false,
  _pending: false,
  onReady(route, fn) {
    this.handlers[route] = fn;
  },
  resolve(target) {
    target = String(target == null ? '' : target).trim();
    if (/^(https?:|mailto:|blob:|data:)/i.test(target)) return { external: target };
    let inPage = '';
    const hashIdx = target.indexOf('#');
    if (hashIdx >= 0) {
      inPage = target.slice(hashIdx);
      target = target.slice(0, hashIdx);
    }
    let search = '';
    const qIdx = target.indexOf('?');
    if (qIdx >= 0) {
      search = target.slice(qIdx);
      target = target.slice(0, qIdx);
    }
    let pathname;
    if (!target) pathname = this.location.pathname;
    else if (target.startsWith('/')) pathname = target;
    else {
      const dir = this.location.pathname.replace(/[^/]*$/, '');
      const parts = (dir + target).split('/');
      const stack = [];
      for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') stack.pop();
        else stack.push(part);
      }
      pathname = '/' + stack.join('/');
    }
    if (pathname === '/') pathname = '/index.html';
    return { pathname, search, hash: inPage, href: pathname + search + inPage };
  },
  hashUrl(dest) {
    return '#' + dest.pathname + (dest.search || '') + (dest.hash || '');
  },
  parseHash() {
    let raw = location.hash.startsWith('#') ? location.hash.slice(1) : '';
    try { raw = decodeURIComponent(raw); } catch (err) { /* keep raw */ }
    if (!raw || raw === '/') {
      return { pathname: '/index.html', search: '', hash: '', href: '/index.html' };
    }
    if (!raw.startsWith('/')) raw = '/' + raw;
    const htmlAt = raw.toLowerCase().indexOf('.html');
    if (htmlAt >= 0) {
      const after = raw.slice(htmlAt + 5);
      const h = after.indexOf('#');
      if (h >= 0) {
        const inPage = after.slice(h);
        raw = raw.slice(0, htmlAt + 5 + h);
        const q = raw.indexOf('?');
        const pathname = q >= 0 ? raw.slice(0, q) : raw;
        const search = q >= 0 ? raw.slice(q) : '';
        return { pathname, search, hash: inPage, href: pathname + search + inPage };
      }
    }
    const q = raw.indexOf('?');
    const pathname = q >= 0 ? raw.slice(0, q) : raw;
    const search = q >= 0 ? raw.slice(q) : '';
    return { pathname, search, hash: '', href: pathname + search };
  },
  go(target) {
    const dest = this.resolve(target);
    if (dest.external) {
      window.location.href = dest.external;
      return;
    }
    const sameDoc = dest.pathname === this.location.pathname && dest.search === this.location.search;
    this.location = dest;
    const url = this.hashUrl(dest);
    if (location.hash !== url) history.pushState({ hf: 1 }, '', url);
    if (sameDoc) {
      this.scrollToHash();
      return;
    }
    this.render();
  },
  replace(target) {
    const dest = this.resolve(target);
    const samePath = dest.pathname === this.location.pathname;
    this.location = dest;
    history.replaceState({ hf: 1 }, '', this.hashUrl(dest));
    if (!samePath) this.render();
  },
  reload() {
    this.render();
  },
  scrollToHash() {
    const h = this.location.hash;
    if (!h || h === '#') {
      window.scrollTo(0, 0);
      return;
    }
    const id = h.slice(1);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView();
    else window.scrollTo(0, 0);
  },
  render() {
    if (this._rendering) {
      this._pending = true;
      return;
    }
    this._rendering = true;
    try {
      const pathAtStart = this.location.pathname;
      document.querySelectorAll('.sidebar-backdrop, .drawer-backdrop, .modal-backdrop').forEach((el) => el.remove());
      document.body.style.overflow = '';
      const known = Object.prototype.hasOwnProperty.call(this.views, pathAtStart);
      const viewPath = known ? pathAtStart : '/404.html';
      const app = document.getElementById('app');
      app.innerHTML = this.views[viewPath] || '';
      document.title = known ? (this.titles[pathAtStart] || 'HireFlow') : (this.titles['/404.html'] || 'Page Not Found');
      const handler = this.handlers[viewPath];
      if (handler) handler();
      if (this.location.pathname !== pathAtStart) return;
      this.scrollToHash();
    } finally {
      this._rendering = false;
      if (this._pending) {
        this._pending = false;
        this.render();
      }
    }
  },
  start() {
    document.querySelectorAll('template[data-route]').forEach((node) => {
      const route = node.getAttribute('data-route');
      this.views[route] = node.innerHTML;
      this.titles[route] = node.getAttribute('data-title') || 'HireFlow';
    });
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      if (a.target && a.target !== '_self') return;
      if (a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || /^(https?:|mailto:|blob:|data:|javascript:)/i.test(href)) return;
      e.preventDefault();
      HF.go(href);
    });
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form && form.tagName === 'FORM' && !form.getAttribute('action')) {
        e.preventDefault();
      }
    }, true);
    window.addEventListener('popstate', () => {
      HF.location = HF.parseHash();
      HF.render();
    });
    if (!location.hash.startsWith('#/')) {
      history.replaceState({ hf: 1 }, '', '#/index.html');
    }
    HF.location = HF.parseHash();
    HF.render();
  }
};

/* js/lib/storage.js */
/**
 * HireFlow Storage Utility
 * Safe, robust localStorage wrapper with error recovery and quota detection.
 */

const storage = {
  /**
   * Read and parse JSON from localStorage
   * @param {string} key 
   * @param {any} defaultValue 
   * @returns {any}
   */
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;
      return JSON.parse(item);
    } catch (err) {
      console.error(`[HireFlow Storage] Error reading key "${key}":`, err);
      return defaultValue;
    }
  },

  /**
   * Serialize and store value in localStorage
   * @param {string} key 
   * @param {any} value 
   * @returns {boolean} Success status
   */
  set(key, value) {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return true;
    } catch (err) {
      if (
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014
      ) {
        console.error('[HireFlow Storage] LocalStorage quota exceeded!', err);
        alert('Browser storage quota exceeded. Please reset demo data in Settings.');
      } else {
        console.error(`[HireFlow Storage] Error writing key "${key}":`, err);
      }
      return false;
    }
  },

  /**
   * Remove a key
   * @param {string} key 
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error(`[HireFlow Storage] Error removing key "${key}":`, err);
    }
  },

  /**
   * Clear all app storage
   */
  clear() {
    try {
      localStorage.clear();
    } catch (err) {
      console.error('[HireFlow Storage] Error clearing localStorage:', err);
    }
  }
};

/* js/lib/escape.js */
/**
 * HireFlow Security Utilities - HTML Escaping & Sanitization
 * Strictly prevents XSS and CSV formula injection
 */

/**
 * Escapes unsafe HTML characters in a string
 * @param {string|number|null|undefined} str 
 * @returns {string} Safe escaped string
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes attributes to prevent breaking out of attribute quotes
 * @param {string} str 
 * @returns {string}
 */
function sanitizeAttr(str) {
  return escapeHTML(str);
}

/**
 * Tagged template literal for safe HTML rendering.
 * All interpolated variables are escaped automatically unless flagged as safe.
 * Example: html`<div>${candidate.name}</div>`
 */
function html(strings, ...values) {
  return strings.reduce((result, string, i) => {
    const value = values[i - 1];
    let safeValue = '';
    
    if (value === null || value === undefined) {
      safeValue = '';
    } else if (value && value.__safeHTML === true) {
      safeValue = value.content;
    } else if (Array.isArray(value)) {
      safeValue = value.map(v => (v && v.__safeHTML ? v.content : escapeHTML(v))).join('');
    } else {
      safeValue = escapeHTML(value);
    }
    
    return result + safeValue + string;
  });
}

/**
 * Mark a string as trusted HTML that shouldn't be re-escaped by html``
 * @param {string} str 
 * @returns {Object} Safe HTML container
 */
function safeHTML(str) {
  return { __safeHTML: true, content: String(str) };
}

/**
 * Sanitizes CSV cell values to prevent CSV formula injection (OWASP guideline)
 * In spreadsheet software, cells starting with =, +, -, @, or tab are treated as formulas.
 * @param {string|number} value 
 * @returns {string} Sanitized CSV cell
 */
function sanitizeCSV(value) {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str; // Prefix with single apostrophe to force text interpretation
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/* js/lib/dates.js */
/**
 * HireFlow Date & Time Helper Utilities
 * Rule: Store ISO 8601 UTC strings, display in the browser's local timezone.
 */

/**
 * Format ISO string to local human readable date (e.g. "Oct 24, 2026")
 * @param {string|Date} isoStr 
 * @param {Intl.DateTimeFormatOptions} options 
 * @returns {string}
 */
function formatDate(isoStr, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!isoStr) return 'N/A';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat(navigator.language || 'en-US', options).format(date);
}

/**
 * Format ISO string to local date and time (e.g. "Oct 24, 2026, 3:30 PM")
 * @param {string|Date} isoStr 
 * @returns {string}
 */
function formatDateTime(isoStr) {
  if (!isoStr) return 'N/A';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return 'Invalid date';
  return new Intl.DateTimeFormat(navigator.language || 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

/**
 * Format ISO string to local time only (e.g. "3:30 PM")
 * @param {string|Date} isoStr 
 * @returns {string}
 */
function formatTime(isoStr) {
  if (!isoStr) return 'N/A';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return 'Invalid time';
  return new Intl.DateTimeFormat(navigator.language || 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

/**
 * Format date for HTML <input type="date"> (YYYY-MM-DD)
 * @param {string|Date} isoStr 
 * @returns {string}
 */
function formatDateInput(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format datetime for HTML <input type="datetime-local">
 * @param {string|Date} isoStr 
 * @returns {string}
 */
function formatDateTimeInput(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Returns human-friendly relative time (e.g. "3 days ago", "in 2 hours", "Just now")
 * @param {string|Date} isoStr 
 * @returns {string}
 */
function relativeTime(isoStr) {
  if (!isoStr) return 'N/A';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return 'Invalid date';
  
  const now = new Date();
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHours = Math.round(diffMin / 60);
  const diffDays = Math.round(diffHours / 24);

  // If Intl.RelativeTimeFormat is available
  if (typeof Intl !== 'undefined' && Intl.RelativeTimeFormat) {
    const rtf = new Intl.RelativeTimeFormat(navigator.language || 'en-US', { numeric: 'auto' });
    if (Math.abs(diffSec) < 60) return 'Just now';
    if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
    if (Math.abs(diffHours) < 24) return rtf.format(diffHours, 'hour');
    if (Math.abs(diffDays) < 30) return rtf.format(diffDays, 'day');
    const diffMonths = Math.round(diffDays / 30);
    if (Math.abs(diffMonths) < 12) return rtf.format(diffMonths, 'month');
    return rtf.format(Math.round(diffDays / 365), 'year');
  }

  // Fallback
  if (diffDays === 0) return 'Today';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
  return `in ${diffDays} days`;
}

/**
 * Calculates calendar days elapsed between two dates
 * @param {string|Date} earlier 
 * @param {string|Date} later 
 * @returns {number}
 */
function daysBetween(earlier, later = new Date()) {
  const d1 = new Date(earlier);
  const d2 = new Date(later);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Helper to add days to a date and return ISO 8601 UTC string
 * @param {number} days 
 * @param {Date} fromDate 
 * @returns {string}
 */
function addDaysISO(days, fromDate = new Date()) {
  const result = new Date(fromDate);
  result.setDate(result.getDate() + days);
  return result.toISOString();
}

/* js/lib/validate.js */
/**
 * HireFlow Form Validation Engine
 * Provides live, accessible validation with ARIA compliance
 */

const rules = {
  required(val, message = 'This field is required') {
    if (val === null || val === undefined) return message;
    if (typeof val === 'string' && val.trim() === '') return message;
    if (Array.isArray(val) && val.length === 0) return message;
    if (typeof val === 'boolean' && !val) return message;
    return null;
  },

  email(val, message = 'Please enter a valid email address') {
    if (!val) return null; // let 'required' rule handle emptiness
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(String(val).trim()) ? null : message;
  },

  phone(val, message = 'Please enter a valid phone number (e.g. +1 555-0199)') {
    if (!val) return null;
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,15}$/;
    return phoneRegex.test(String(val).trim()) ? null : message;
  },

  url(val, message = 'Please enter a valid URL (http:// or https://)') {
    if (!val) return null;
    try {
      const parsed = new URL(val);
      return ['http:', 'https:'].includes(parsed.protocol) ? null : message;
    } catch {
      return message;
    }
  },

  minLength(length, message) {
    return (val) => {
      if (!val) return null;
      const str = String(val).trim();
      return str.length >= length ? null : (message || `Must be at least ${length} characters`);
    };
  },

  maxLength(length, message) {
    return (val) => {
      if (!val) return null;
      const str = String(val).trim();
      return str.length <= length ? null : (message || `Cannot exceed ${length} characters`);
    };
  },

  numericRange(min, max, message) {
    return (val) => {
      if (val === '' || val === null || val === undefined) return null;
      const num = Number(val);
      if (isNaN(num)) return 'Must be a valid number';
      if (min !== undefined && num < min) return message || `Must be at least ${min}`;
      if (max !== undefined && num > max) return message || `Cannot exceed ${max}`;
      return null;
    };
  },

  dateInFuture(message = 'Date must be in the future') {
    return (val) => {
      if (!val) return null;
      const date = new Date(val);
      if (isNaN(date.getTime())) return 'Invalid date';
      return date.getTime() > Date.now() ? null : message;
    };
  },

  matches(otherValueGetter, fieldName = 'matching field') {
    return (val) => {
      const other = otherValueGetter();
      return val === other ? null : `Does not match ${fieldName}`;
    };
  },

  fileValidation(allowedTypes = ['application/pdf', '.pdf', '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], maxSizeBytes = 2097152) {
    return (file) => {
      if (!file) return null;
      
      // Size check
      if (file.size > maxSizeBytes) {
        const mb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
        return `File size cannot exceed ${mb} MB`;
      }

      // Extension / MIME check
      const fileName = file.name.toLowerCase();
      const hasValidExt = fileName.endsWith('.pdf') || fileName.endsWith('.docx');
      const hasValidMime = file.type === 'application/pdf' || 
                           file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                           file.type === ''; // Some browsers return empty MIME for docx

      if (!hasValidExt && !hasValidMime) {
        return 'Only PDF and DOCX files are accepted';
      }

      return null;
    };
  }
};

/**
 * Validate a form data object against rule definitions
 * @param {Object} data 
 * @param {Object} schema 
 * @returns {{ isValid: boolean, errors: Object }}
 */
function validate(data, schema) {
  const errors = {};
  let isValid = true;

  for (const [field, fieldRules] of Object.entries(schema)) {
    const val = data[field];
    for (const rule of fieldRules) {
      const errorMsg = rule(val);
      if (errorMsg) {
        errors[field] = errorMsg;
        isValid = false;
        break; // stop on first error for this field
      }
    }
  }

  return { isValid, errors };
}

/**
 * Attach live accessibility validation to a form
 * @param {HTMLFormElement} form 
 * @param {Object} schema 
 * @param {Function} onSubmitSuccess 
 */
function setupFormValidation(form, schema, onSubmitSuccess) {
  if (!form) return;

  function setFieldError(fieldInput, errorMsg) {
    const group = fieldInput.closest('.form-group') || fieldInput.parentElement;
    if (!group) return;

    let errorEl = group.querySelector('.form-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'form-error';
      errorEl.id = `${fieldInput.id || fieldInput.name}-error`;
      group.appendChild(errorEl);
    }

    if (errorMsg) {
      group.classList.add('has-error');
      errorEl.textContent = errorMsg;
      errorEl.setAttribute('role', 'alert');
      fieldInput.setAttribute('aria-invalid', 'true');
      fieldInput.setAttribute('aria-describedby', errorEl.id);
    } else {
      group.classList.remove('has-error');
      errorEl.textContent = '';
      fieldInput.removeAttribute('aria-invalid');
      fieldInput.removeAttribute('aria-describedby');
    }
  }

  // Validate on blur for fields in schema
  for (const fieldName of Object.keys(schema)) {
    const input = form.elements[fieldName];
    if (input) {
      input.addEventListener('blur', () => {
        const val = input.type === 'checkbox' ? input.checked : (input.type === 'file' ? input.files[0] : input.value);
        let errorMsg = null;
        for (const rule of schema[fieldName]) {
          errorMsg = rule(val);
          if (errorMsg) break;
        }
        setFieldError(input, errorMsg);
      });

      // Clear error on input
      input.addEventListener('input', () => {
        if (input.closest('.form-group')?.classList.contains('has-error')) {
          setFieldError(input, null);
        }
      });
    }
  }

  // Submit handler
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = {};
    for (const [key] of Object.entries(schema)) {
      const el = form.elements[key];
      if (el) {
        if (el.type === 'checkbox') {
          data[key] = el.checked;
        } else if (el.type === 'file') {
          data[key] = el.files[0] || null;
        } else {
          data[key] = el.value;
        }
      }
    }

    const { isValid, errors } = validate(data, schema);

    // Apply errors or clear
    let firstInvalidInput = null;
    for (const fieldName of Object.keys(schema)) {
      const input = form.elements[fieldName];
      if (input) {
        const errorMsg = errors[fieldName] || null;
        setFieldError(input, errorMsg);
        if (errorMsg && !firstInvalidInput) {
          firstInvalidInput = input;
        }
      }
    }

    if (!isValid) {
      if (firstInvalidInput) {
        firstInvalidInput.focus();
      }
      return;
    }

    if (onSubmitSuccess) {
      onSubmitSuccess(data, form);
    }
  });
}

/* js/lib/ui.js */
/**
 * HireFlow UI Component Controller & Helpers
 * Provides accessible modals, drawers, toasts, theme toggles, and layout helpers.
 */


let lastActiveElement = null;

/**
 * Display an accessible toast notification
 * @param {string} message 
 * @param {'success'|'error'|'info'|'warning'} type 
 * @param {number} duration 
 */
function showToast(message, type = 'info', duration = 4000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('role', 'status');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-message">${escapeHTML(message)}</div>
    <button type="button" class="toast-close" aria-label="Dismiss notification">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  const dismiss = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  };

  closeBtn.addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

/**
 * Open modal with accessible focus trapping, Esc key binding and scroll lock
 * @param {string|HTMLElement} modalElOrId 
 */
function openModal(modalElOrId) {
  const modalBackdrop = typeof modalElOrId === 'string' 
    ? document.getElementById(modalElOrId) 
    : modalElOrId;
  if (!modalBackdrop) return;

  lastActiveElement = document.activeElement;
  modalBackdrop.classList.add('is-open');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  const modal = modalBackdrop.querySelector('.modal') || modalBackdrop;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  // Focus first interactive element
  const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length > 0) {
    setTimeout(() => focusable[0].focus(), 50);
  }

  // Key handler
  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      closeModal(modalBackdrop);
      window.removeEventListener('keydown', handleKeydown);
    } else if (e.key === 'Tab') {
      // Trap focus
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  window.addEventListener('keydown', handleKeydown);

  // Close on backdrop click (outside modal card)
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      closeModal(modalBackdrop);
      window.removeEventListener('keydown', handleKeydown);
    }
  });

  // Attach any [data-close-modal] buttons inside
  modalBackdrop.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.onclick = () => {
      closeModal(modalBackdrop);
      window.removeEventListener('keydown', handleKeydown);
    };
  });
}

/**
 * Close modal and restore focus
 * @param {string|HTMLElement} modalElOrId 
 */
function closeModal(modalElOrId) {
  const modalBackdrop = typeof modalElOrId === 'string' 
    ? document.getElementById(modalElOrId) 
    : modalElOrId;
  if (!modalBackdrop) return;

  modalBackdrop.classList.remove('is-open');
  modalBackdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
    lastActiveElement.focus();
  }
}

/**
 * Open side drawer with backdrop
 * @param {string} drawerId 
 */
function openDrawer(drawerId) {
  const drawer = document.getElementById(drawerId);
  if (!drawer) return;

  let backdrop = document.querySelector(`.drawer-backdrop[data-drawer="${drawerId}"]`);
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    backdrop.setAttribute('data-drawer', drawerId);
    document.body.appendChild(backdrop);
  }

  lastActiveElement = document.activeElement;
  backdrop.classList.add('is-open');
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('role', 'dialog');
  document.body.style.overflow = 'hidden';

  const closeDrawerAction = () => closeDrawer(drawerId);
  backdrop.onclick = closeDrawerAction;

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeDrawerAction();
      window.removeEventListener('keydown', escHandler);
    }
  };
  window.addEventListener('keydown', escHandler);

  drawer.querySelectorAll('[data-close-drawer]').forEach(btn => {
    btn.onclick = () => {
      closeDrawerAction();
      window.removeEventListener('keydown', escHandler);
    };
  });

  const focusable = drawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length > 0) {
    setTimeout(() => focusable[0].focus(), 50);
  }
}

/**
 * Close side drawer
 * @param {string} drawerId 
 */
function closeDrawer(drawerId) {
  const drawer = document.getElementById(drawerId);
  if (drawer) drawer.classList.remove('is-open');

  const backdrop = document.querySelector(`.drawer-backdrop[data-drawer="${drawerId}"]`);
  if (backdrop) backdrop.classList.remove('is-open');

  document.body.style.overflow = '';
  if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
    lastActiveElement.focus();
  }
}

/**
 * Accessible confirmation dialog for destructive or important actions
 * @param {{ title: string, message: string, confirmText?: string, cancelText?: string, danger?: boolean }} options 
 * @returns {Promise<boolean>}
 */
function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop is-open';
    backdrop.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" style="max-width: 440px;">
        <div class="modal-header">
          <h3 id="dialog-title" class="modal-title">${escapeHTML(title)}</h3>
          <button type="button" class="btn-icon btn-ghost" data-action="cancel" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="modal-body">
          <p style="margin: 0; color: var(--text-muted);">${escapeHTML(message)}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-action="cancel">${escapeHTML(cancelText)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${escapeHTML(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    const confirmBtn = backdrop.querySelector('[data-action="confirm"]');
    const cancelBtns = backdrop.querySelectorAll('[data-action="cancel"]');

    const cleanup = (confirmed) => {
      backdrop.classList.remove('is-open');
      setTimeout(() => backdrop.remove(), 200);
      resolve(confirmed);
    };

    confirmBtn.onclick = () => cleanup(true);
    cancelBtns.forEach(btn => btn.onclick = () => cleanup(false));

    backdrop.onclick = (e) => {
      if (e.target === backdrop) cleanup(false);
    };

    confirmBtn.focus();
  });
}

/**
 * Render empty state inside a container
 * @param {HTMLElement} container 
 * @param {string} title 
 * @param {string} message 
 * @param {string} actionHtml 
 */
function renderEmpty(container, title = 'No items found', message = 'There are no records to display at this time.', actionHtml = '') {
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <div class="empty-state-title">${escapeHTML(title)}</div>
      <p class="empty-state-text">${escapeHTML(message)}</p>
      ${actionHtml ? `<div style="margin-top: var(--space-2);">${actionHtml}</div>` : ''}
    </div>
  `;
}

/**
 * Render error state with retry button
 * @param {HTMLElement} container 
 * @param {string} message 
 * @param {Function} onRetry 
 */
function renderError(container, message = 'An error occurred while loading data.', onRetry = null) {
  if (!container) return;
  container.innerHTML = `
    <div class="error-state" role="alert">
      <div class="error-state-title">Error Loading Data</div>
      <p style="margin-bottom: var(--space-4); color: var(--danger); font-size: var(--font-size-sm);">${escapeHTML(message)}</p>
      ${onRetry ? `<button type="button" class="btn btn-secondary btn-sm" id="btn-retry-action">Retry</button>` : ''}
    </div>
  `;
  if (onRetry) {
    const retryBtn = container.querySelector('#btn-retry-action');
    if (retryBtn) retryBtn.onclick = onRetry;
  }
}

/**
 * Render skeleton loading placeholders
 * @param {HTMLElement} container 
 * @param {'card'|'row'|'kanban'} type 
 * @param {number} count 
 */
function renderSkeleton(container, type = 'card', count = 3) {
  if (!container) return;
  let html = '';
  for (let i = 0; i < count; i++) {
    if (type === 'card') {
      html += `
        <div class="card" style="margin-bottom: var(--space-4); pointer-events: none;">
          <div class="skeleton" style="height: 20px; width: 60%; margin-bottom: 12px;"></div>
          <div class="skeleton" style="height: 14px; width: 40%; margin-bottom: 8px;"></div>
          <div class="skeleton" style="height: 14px; width: 85%;"></div>
        </div>
      `;
    } else if (type === 'row') {
      html += `
        <tr>
          <td colspan="7"><div class="skeleton" style="height: 24px; width: 100%;"></div></td>
        </tr>
      `;
    }
  }
  container.innerHTML = html;
}

/**
 * Toggle loading state on a button
 * @param {HTMLButtonElement} btn 
 * @param {boolean} isLoading 
 */
function setLoading(btn, isLoading) {
  if (!btn) return;
  if (isLoading) {
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
  } else {
    btn.classList.remove('is-loading');
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
  }
}

/**
 * Render avatar with hash-based color and user initials
 * @param {string} name 
 * @param {'xs'|'sm'|'md'|'lg'|'xl'} size 
 * @returns {string} HTML string
 */
function renderAvatar(name = 'User', size = 'md') {
  const cleanName = String(name || 'User').trim();
  const parts = cleanName.split(/\s+/);
  let initials = parts[0] ? parts[0][0] : 'U';
  if (parts.length > 1 && parts[parts.length - 1]) {
    initials += parts[parts.length - 1][0];
  }
  initials = initials.toUpperCase();

  // Consistent pleasant color palette
  const colors = [
    '#4F46E5', '#7C3AED', '#2563EB', '#0D9488',
    '#059669', '#D97706', '#E11D48', '#DB2777'
  ];
  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];

  return `
    <span class="avatar avatar-${size}" style="background-color: ${color};" title="${escapeHTML(cleanName)}">
      ${escapeHTML(initials)}
    </span>
  `;
}

/**
 * Setup Light / Dark theme toggle
 * Reads from localStorage or system prefers-color-scheme
 */
function setupThemeToggle() {
  const currentTheme = localStorage.getItem('hireflow_theme') || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  document.documentElement.setAttribute('data-theme', currentTheme);

  const toggleBtns = document.querySelectorAll('[data-action="toggle-theme"]');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const active = document.documentElement.getAttribute('data-theme');
      const next = active === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('hireflow_theme', next);
    });
  });
}

/**
 * Injects and manages the required Demo Mode Banner on every page
 */
function initDemoBanner() {
  if (document.querySelector('.demo-banner')) return;
  const isDismissed = sessionStorage.getItem('hireflow_banner_dismissed') === 'true';

  const banner = document.createElement('div');
  banner.className = `demo-banner ${isDismissed ? 'hidden' : ''}`;
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Demo Environment Notice');
  banner.innerHTML = `
    <div class="demo-banner-content">
      <span class="badge">DEMO MODE</span>
      <span>Demo mode: data is simulated and stored in your browser. Emails are mocked. Not for real candidate data.</span>
    </div>
    <button type="button" class="demo-banner-close" aria-label="Dismiss demo notice">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;

  banner.querySelector('.demo-banner-close').addEventListener('click', () => {
    banner.classList.add('hidden');
    sessionStorage.setItem('hireflow_banner_dismissed', 'true');
  });

  document.body.prepend(banner);
}

/**
 * Setup mobile sidebar drawer toggle
 */
function setupSidebar() {
  const toggleBtn = document.querySelector('.sidebar-toggle-btn');
  const sidebar = document.querySelector('.app-sidebar');
  if (!toggleBtn || !sidebar) return;

  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }

  const toggle = () => {
    sidebar.classList.toggle('is-open');
    backdrop.classList.toggle('is-open');
  };

  toggleBtn.addEventListener('click', toggle);
  backdrop.addEventListener('click', toggle);
}

/* js/lib/charts.js */
/**
 * HireFlow Data Visualization Engine (charts.js)
 * High-performance, pure vanilla SVG/Canvas visualizations.
 * Includes interactive tooltips and accessible screen-reader data table alternatives.
 */


/**
 * Render Area / Line Chart for Applications Over Time
 * @param {HTMLElement} container 
 * @param {Array<{ label: string, count: number }>} data 
 */
function renderLineChart(container, data = []) {
  if (!container) return;
  if (!data || data.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 2rem;"><p class="text-muted">No application data for this period.</p></div>`;
    return;
  }

  const width = 600;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map(d => d.count), 5);
  const xStep = graphWidth / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => {
    const x = padding.left + i * xStep;
    const y = padding.top + graphHeight - (d.count / maxVal) * graphHeight;
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + graphHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + graphHeight).toFixed(1)} Z`;

  let svg = `
    <div style="position: relative; width: 100%;">
      <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: auto; display: block;" role="img" aria-label="Applications over time trend line chart">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4F46E5" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#4F46E5" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <!-- Horizontal Grid lines -->
        ${[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padding.top + graphHeight * (1 - pct);
          const val = Math.round(maxVal * pct);
          return `
            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="var(--border)" stroke-dasharray="3 3"/>
            <text x="${padding.left - 8}" y="${y + 4}" font-size="11" fill="var(--text-muted)" text-anchor="end">${val}</text>
          `;
        }).join('')}
        
        <!-- Fill Area -->
        <path d="${areaD}" fill="url(#lineGrad)"/>
        
        <!-- Stroke Line -->
        <path d="${pathD}" fill="none" stroke="#4F46E5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        
        <!-- Data Dots -->
        ${points.map(p => `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#FFFFFF" stroke="#4F46E5" stroke-width="2" class="chart-point" data-label="${escapeHTML(p.label)}" data-val="${p.count}">
            <title>${escapeHTML(p.label)}: ${p.count} applications</title>
          </circle>
          <text x="${p.x.toFixed(1)}" y="${height - 12}" font-size="11" fill="var(--text-muted)" text-anchor="middle">${escapeHTML(p.label)}</text>
        `).join('')}
      </svg>
      <details style="margin-top: 8px;">
        <summary style="font-size: 11px; color: var(--text-muted); cursor: pointer;">Show data table</summary>
        <table class="table" style="font-size: 12px; margin-top: 6px;">
          <thead><tr><th>Period</th><th>Applications</th></tr></thead>
          <tbody>
            ${data.map(d => `<tr><td>${escapeHTML(d.label)}</td><td>${d.count}</td></tr>`).join('')}
          </tbody>
        </table>
      </details>
    </div>
  `;

  container.innerHTML = svg;
}

/**
 * Render Stage Funnel Chart with Conversion Rates
 * @param {HTMLElement} container 
 * @param {Array<{ stage: string, count: number, conversionRate?: number }>} funnelData 
 */
function renderFunnelChart(container, funnelData = []) {
  if (!container) return;
  if (!funnelData || funnelData.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 2rem;"><p class="text-muted">No funnel data available.</p></div>`;
    return;
  }

  const maxCount = Math.max(...funnelData.map(d => d.count), 1);
  const colors = {
    'Applied': '#64748B',
    'Screening': '#0284C7',
    'Interview': '#7C3AED',
    'Selected': '#16A34A',
    'Offered': '#D97706'
  };

  let html = `
    <div class="funnel-container" style="display: flex; flex-direction: column; gap: 12px;">
      ${funnelData.map((stage, idx) => {
        const widthPct = Math.max(Math.round((stage.count / maxCount) * 100), 12);
        const color = colors[stage.stage] || '#4F46E5';
        const prev = funnelData[idx - 1];
        let convText = '';
        if (prev && prev.count > 0) {
          const conv = Math.round((stage.count / prev.count) * 100);
          convText = `<span style="font-size: 11px; color: var(--text-muted); margin-left: auto;">${conv}% conversion</span>`;
        }

        return `
          <div class="funnel-row" style="display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600;">
              <span>${escapeHTML(stage.stage)} (${stage.count})</span>
              ${convText}
            </div>
            <div style="background: var(--surface-2); border-radius: var(--radius-sm); height: 26px; overflow: hidden; width: 100%;">
              <div style="background-color: ${color}; width: ${widthPct}%; height: 100%; border-radius: var(--radius-sm); transition: width 0.6s ease; display: flex; align-items: center; padding: 0 8px; color: #ffffff; font-size: 11px; font-weight: 700;">
                ${stage.count}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Render Horizontal Bar Chart for Applications by Job
 * @param {HTMLElement} container 
 * @param {Array<{ title: string, count: number }>} data 
 */
function renderHorizontalBarChart(container, data = []) {
  if (!container) return;
  if (!data || data.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 2rem;"><p class="text-muted">No data available.</p></div>`;
    return;
  }

  const maxVal = Math.max(...data.map(d => d.count), 1);

  let html = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${data.slice(0, 6).map(item => {
        const pct = Math.max(Math.round((item.count / maxVal) * 100), 8);
        return `
          <div style="display: flex; flex-direction: column; gap: 3px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 500;">
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</span>
              <span class="font-bold">${item.count}</span>
            </div>
            <div style="background: var(--surface-2); height: 12px; border-radius: var(--radius-sm); overflow: hidden;">
              <div style="width: ${pct}%; background: var(--primary); height: 100%; border-radius: var(--radius-sm);"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Render Donut Chart for Source or Department breakdown
 * @param {HTMLElement} container 
 * @param {Array<{ label: string, count: number }>} data 
 */
function renderDonutChart(container, data = []) {
  if (!container) return;
  const total = data.reduce((acc, curr) => acc + curr.count, 0);
  if (!data || data.length === 0 || total === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 2rem;"><p class="text-muted">No distribution data.</p></div>`;
    return;
  }

  const colors = ['#4F46E5', '#0284C7', '#16A34A', '#D97706', '#7C3AED', '#EC4899'];
  const size = 180;
  const strokeWidth = 32;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedAngle = 0;
  const segments = data.map((d, i) => {
    const fraction = d.count / total;
    const strokeDasharray = `${(fraction * circumference).toFixed(2)} ${circumference.toFixed(2)}`;
    const strokeDashoffset = -accumulatedAngle * circumference;
    accumulatedAngle += fraction;
    return {
      label: d.label,
      count: d.count,
      pct: Math.round(fraction * 100),
      color: colors[i % colors.length],
      strokeDasharray,
      strokeDashoffset: strokeDashoffset.toFixed(2)
    };
  });

  let html = `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
      <div style="position: relative; width: ${size}px; height: ${size}px;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);" role="img" aria-label="Breakdown donut chart">
          ${segments.map(s => `
            <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
              fill="transparent"
              stroke="${s.color}"
              stroke-width="${strokeWidth}"
              stroke-dasharray="${s.strokeDasharray}"
              stroke-dashoffset="${s.strokeDashoffset}">
              <title>${escapeHTML(s.label)}: ${s.count} (${s.pct}%)</title>
            </circle>
          `).join('')}
        </svg>
        <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
          <span style="font-size: 20px; font-weight: 800; font-family: var(--font-heading);">${total}</span>
          <span style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Total</span>
        </div>
      </div>
      <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; font-size: 11px;">
        ${segments.map(s => `
          <div style="display: flex; align-items: center; gap: 5px;">
            <span style="width: 10px; height: 10px; border-radius: 2px; background: ${s.color};"></span>
            <span>${escapeHTML(s.label)} (${s.pct}%)</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

/* js/lib/calendar.js */
/**
 * HireFlow Calendar Component (calendar.js)
 * Clean, lightweight vanilla JS calendar supporting Month, Week, and List views.
 */


class InterviewCalendar {
  /**
   * @param {HTMLElement} container 
   * @param {Object} options 
   */
  constructor(container, options = {}) {
    this.container = container;
    this.events = options.events || [];
    this.currentDate = new Date();
    this.viewMode = options.defaultView || 'month'; // 'month' | 'week' | 'list'
    this.onEventClick = options.onEventClick || null;
    this.onDateClick = options.onDateClick || null;
    this.render();
  }

  setEvents(events) {
    this.events = events || [];
    this.render();
  }

  next() {
    if (this.viewMode === 'month') {
      this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    } else if (this.viewMode === 'week') {
      this.currentDate.setDate(this.currentDate.getDate() + 7);
    }
    this.render();
  }

  prev() {
    if (this.viewMode === 'month') {
      this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    } else if (this.viewMode === 'week') {
      this.currentDate.setDate(this.currentDate.getDate() - 7);
    }
    this.render();
  }

  today() {
    this.currentDate = new Date();
    this.render();
  }

  setView(mode) {
    this.viewMode = mode;
    this.render();
  }

  render() {
    if (!this.container) return;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const currentMonthLabel = `${monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;

    let contentHtml = '';
    if (this.viewMode === 'month') {
      contentHtml = this.renderMonthView();
    } else if (this.viewMode === 'week') {
      contentHtml = this.renderWeekView();
    } else {
      contentHtml = this.renderListView();
    }

    this.container.innerHTML = `
      <div class="calendar-container">
        <div class="calendar-header">
          <div style="display: flex; align-items: center; gap: var(--space-3);">
            <h2 style="font-size: var(--font-size-md); margin: 0;">${currentMonthLabel}</h2>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="btn btn-secondary btn-sm" id="cal-prev" aria-label="Previous">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <button type="button" class="btn btn-secondary btn-sm" id="cal-today">Today</button>
              <button type="button" class="btn btn-secondary btn-sm" id="cal-next" aria-label="Next">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button type="button" class="btn btn-sm ${this.viewMode === 'month' ? 'btn-primary' : 'btn-secondary'}" data-view="month">Month</button>
            <button type="button" class="btn btn-sm ${this.viewMode === 'week' ? 'btn-primary' : 'btn-secondary'}" data-view="week">Week</button>
            <button type="button" class="btn btn-sm ${this.viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}" data-view="list">List</button>
          </div>
        </div>
        ${contentHtml}
      </div>
    `;

    // Attach control listeners
    this.container.querySelector('#cal-prev').onclick = () => this.prev();
    this.container.querySelector('#cal-next').onclick = () => this.next();
    this.container.querySelector('#cal-today').onclick = () => this.today();

    this.container.querySelectorAll('[data-view]').forEach(btn => {
      btn.onclick = () => this.setView(btn.getAttribute('data-view'));
    });

    // Attach event chip click listeners
    this.container.querySelectorAll('.calendar-event-chip, [data-event-id]').forEach(chip => {
      chip.onclick = (e) => {
        e.stopPropagation();
        const eventId = chip.getAttribute('data-event-id');
        const ev = this.events.find(item => String(item.id) === String(eventId));
        if (ev && this.onEventClick) {
          this.onEventClick(ev);
        }
      };
    });
  }

  renderMonthView() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let cellsHtml = '';

    // Day headers
    const headersHtml = daysOfWeek.map(d => `<div class="calendar-day-header">${d}</div>`).join('');

    // Previous month filler days
    for (let i = firstDay - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      cellsHtml += `<div class="calendar-cell other-month"><div class="calendar-cell-date">${dayNum}</div></div>`;
    }

    // Days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;

      // Find events matching this day
      const dayEvents = this.events.filter(ev => {
        if (!ev.startsAt) return false;
        const d = new Date(ev.startsAt);
        const evDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return evDateStr === dateStr;
      });

      const chipsHtml = dayEvents.map(ev => `
        <span class="calendar-event-chip ${escapeHTML(ev.status || 'scheduled')}" data-event-id="${escapeHTML(ev.id)}" title="${escapeHTML(ev.title)} - ${formatTime(ev.startsAt)}">
          ${formatTime(ev.startsAt)} ${escapeHTML(ev.title)}
        </span>
      `).join('');

      cellsHtml += `
        <div class="calendar-cell ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
          <div class="calendar-cell-date">${day}</div>
          ${chipsHtml}
        </div>
      `;
    }

    // Next month filler
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const remaining = totalCells - (firstDay + daysInMonth);
    for (let i = 1; i <= remaining; i++) {
      cellsHtml += `<div class="calendar-cell other-month"><div class="calendar-cell-date">${i}</div></div>`;
    }

    return `
      <div class="calendar-month-grid">
        ${headersHtml}
        ${cellsHtml}
      </div>
    `;
  }

  renderWeekView() {
    const startOfWeek = new Date(this.currentDate);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      weekDays.push(d);
    }

    return `
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); border-top: 1px solid var(--border);">
        ${weekDays.map(date => {
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          const dayEvents = this.events.filter(ev => {
            const d = new Date(ev.startsAt);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === dateStr;
          });

          return `
            <div style="border-right: 1px solid var(--border); padding: 8px; min-height: 280px; background: var(--surface);">
              <div style="font-size: 12px; font-weight: 700; border-bottom: 1px solid var(--border); padding-bottom: 4px; margin-bottom: 8px;">
                ${formatDate(date, { weekday: 'short', month: 'numeric', day: 'numeric' })}
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${dayEvents.map(ev => `
                  <div class="calendar-event-chip ${escapeHTML(ev.status || 'scheduled')}" data-event-id="${escapeHTML(ev.id)}" style="padding: 6px;">
                    <div style="font-weight: 700;">${formatTime(ev.startsAt)}</div>
                    <div>${escapeHTML(ev.title)}</div>
                    <div style="font-size: 10px; opacity: 0.85;">${escapeHTML(ev.mode)}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderListView() {
    if (!this.events || this.events.length === 0) {
      return `<div class="empty-state" style="padding: 3rem;"><p class="text-muted">No scheduled interviews found.</p></div>`;
    }

    const sorted = [...this.events].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    return `
      <div style="padding: var(--space-4);">
        <table class="table">
          <thead>
            <tr>
              <th>Interview Title</th>
              <th>Date & Time</th>
              <th>Mode</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(ev => `
              <tr>
                <td class="font-semibold">${escapeHTML(ev.title)}</td>
                <td>${formatDate(ev.startsAt)} at ${formatTime(ev.startsAt)}</td>
                <td><span class="badge badge-default">${escapeHTML(ev.mode)}</span></td>
                <td>${ev.durationMin} mins</td>
                <td><span class="badge badge-${ev.status === 'completed' ? 'success' : (ev.status === 'cancelled' ? 'danger' : 'primary')}">${escapeHTML(ev.status)}</span></td>
                <td>
                  <button type="button" class="btn btn-secondary btn-sm" data-event-id="${escapeHTML(ev.id)}">Details</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

/* js/lib/dnd.js */
/**
 * HireFlow Drag-and-Drop Controller (dnd.js)
 * Implements HTML5 Drag and Drop API with full keyboard accessibility fallback
 * and live screen reader ARIA announcements.
 */


class KanbanDnD {
  /**
   * @param {Object} options 
   * @param {Function} options.onMove (cardId, targetStage) => Promise<boolean>
   * @param {Function} options.getAllowedStages (currentStage) => string[]
   */
  constructor(options = {}) {
    this.onMove = options.onMove || null;
    this.getAllowedStages = options.getAllowedStages || (() => []);
    this.draggedCard = null;
    this.liveAnnouncer = null;
    this.initAnnouncer();
  }

  initAnnouncer() {
    this.liveAnnouncer = document.getElementById('kanban-live-announcer');
    if (!this.liveAnnouncer) {
      this.liveAnnouncer = document.createElement('div');
      this.liveAnnouncer.id = 'kanban-live-announcer';
      this.liveAnnouncer.className = 'sr-only';
      this.liveAnnouncer.setAttribute('aria-live', 'assertive');
      this.liveAnnouncer.setAttribute('aria-atomic', 'true');
      document.body.appendChild(this.liveAnnouncer);
    }
  }

  announce(text) {
    if (this.liveAnnouncer) {
      this.liveAnnouncer.textContent = text;
    }
  }

  /**
   * Bind drag and drop events to board container
   * @param {HTMLElement} boardEl 
   */
  bind(boardEl) {
    if (!boardEl) return;

    // Delegate dragstart
    boardEl.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.kanban-card');
      if (!card) return;

      this.draggedCard = card;
      card.classList.add('is-dragging');
      const cardId = card.getAttribute('data-id');
      const currentStage = card.getAttribute('data-stage');
      const cardName = card.querySelector('.kanban-card-title')?.textContent || 'Candidate';

      e.dataTransfer.setData('text/plain', JSON.stringify({ cardId, currentStage }));
      e.dataTransfer.effectAllowed = 'move';
      this.announce(`Started dragging ${cardName} from ${currentStage}`);
    });

    // Delegate dragend
    boardEl.addEventListener('dragend', (e) => {
      const card = e.target.closest('.kanban-card');
      if (card) {
        card.classList.remove('is-dragging');
      }
      this.draggedCard = null;
      boardEl.querySelectorAll('.kanban-card-list').forEach(col => col.classList.remove('drag-over'));
    });

    // Dragover on columns
    boardEl.addEventListener('dragover', (e) => {
      const list = e.target.closest('.kanban-card-list');
      if (!list) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.classList.add('drag-over');
    });

    // Dragleave on columns
    boardEl.addEventListener('dragleave', (e) => {
      const list = e.target.closest('.kanban-card-list');
      if (!list) return;
      if (!list.contains(e.relatedTarget)) {
        list.classList.remove('drag-over');
      }
    });

    // Drop on column list
    boardEl.addEventListener('drop', async (e) => {
      const list = e.target.closest('.kanban-card-list');
      if (!list) return;
      e.preventDefault();
      list.classList.remove('drag-over');

      const col = list.closest('.kanban-column');
      const targetStage = col ? col.getAttribute('data-stage') : null;
      if (!targetStage || !this.draggedCard) return;

      const cardId = this.draggedCard.getAttribute('data-id');
      const currentStage = this.draggedCard.getAttribute('data-stage');
      const candidateName = this.draggedCard.querySelector('.kanban-card-title')?.textContent || 'Candidate';

      if (currentStage === targetStage) return;

      const allowed = this.getAllowedStages(currentStage);
      if (!allowed.includes(targetStage)) {
        showToast(`Cannot move from ${currentStage} directly to ${targetStage}. Check pipeline rules.`, 'error');
        this.announce(`Invalid move: cannot move ${candidateName} to ${targetStage}`);
        return;
      }

      if (this.onMove) {
        const success = await this.onMove(cardId, targetStage);
        if (success) {
          this.announce(`Successfully moved ${candidateName} to ${targetStage}`);
        }
      }
    });
  }

  /**
   * Attach keyboard accessible "Move to..." controls to a card
   * @param {HTMLElement} cardEl 
   * @param {string[]} allowedStages 
   */
  attachKeyboardMenu(cardEl, allowedStages = []) {
    const actionBtn = cardEl.querySelector('[data-action="move-menu"]');
    if (!actionBtn) return;

    actionBtn.onclick = (e) => {
      e.stopPropagation();
      // Close other open menus
      document.querySelectorAll('.dropdown.is-open').forEach(d => d.classList.remove('is-open'));

      const dropdown = actionBtn.closest('.dropdown');
      if (dropdown) {
        dropdown.classList.toggle('is-open');
      }
    };
  }
}

/* js/core/data.js */
/**
 * HireFlow Seed & In-Browser Database (data.js)
 * Stored under key "hireflow_db_v1" in localStorage.
 * Completely simulated synthetic data.
 */


const DB_KEY = 'hireflow_db_v1';
const SESSION_KEY = 'hireflow_session';

/**
 * Mock password hashing function.
 * Note: DEMO ONLY - this is not real cryptographic security!
 */
function mockHash(pwd) {
  let hash = 0;
  for (let i = 0; i < pwd.length; i++) {
    hash = (hash << 5) - hash + pwd.charCodeAt(i);
    hash |= 0;
  }
  return `mock_hash_${Math.abs(hash)}`;
}

const INITIAL_PASSWORD_HASH = mockHash('Demo@1234');

/**
 * Generates initial synthetic database
 */
function generateSeedData() {
  const now = new Date();
  const subDays = (d) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
  const addDays = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString();

  // 1. Company
  const companies = [
    {
      id: 'comp_1',
      name: 'Acme Innovations',
      industry: 'Cloud Software & Enterprise Solutions',
      website: 'https://acme.example.com',
      logoText: 'Acme',
      createdAt: subDays(120)
    }
  ];

  // 2. Users (Admin, 2 HR, 25 Candidates)
  const users = [
    {
      id: 'usr_admin',
      name: 'Admin User',
      email: 'admin@example.com',
      passwordHash: INITIAL_PASSWORD_HASH,
      role: 'admin',
      companyId: 'comp_1',
      active: true,
      createdAt: subDays(100),
      lastLoginAt: subDays(1)
    },
    {
      id: 'usr_hr_1',
      name: 'Elena Rostova',
      email: 'hr@example.com',
      passwordHash: INITIAL_PASSWORD_HASH,
      role: 'hr',
      companyId: 'comp_1',
      active: true,
      createdAt: subDays(95),
      lastLoginAt: subDays(0)
    },
    {
      id: 'usr_hr_2',
      name: 'Marcus Vance',
      email: 'marcus.hr@example.com',
      passwordHash: INITIAL_PASSWORD_HASH,
      role: 'hr',
      companyId: 'comp_1',
      active: true,
      createdAt: subDays(80),
      lastLoginAt: subDays(2)
    }
  ];

  const candidateNames = [
    { name: 'Liam Cooper', email: 'candidate@example.com', title: 'Senior Frontend Engineer', exp: 6, loc: 'San Francisco, CA', skills: ['JavaScript', 'HTML5', 'CSS3', 'React', 'TypeScript'] },
    { name: 'Maya Patel', email: 'maya.patel@example.com', title: 'Lead Product Designer', exp: 7, loc: 'New York, NY', skills: ['Figma', 'UI/UX', 'Design Systems', 'User Research'] },
    { name: 'Alex Chen', email: 'alex.chen@example.com', title: 'Full Stack Developer', exp: 4, loc: 'Remote, US', skills: ['Node.js', 'React', 'PostgreSQL', 'Docker'] },
    { name: 'Priya Sharma', email: 'priya.sharma@example.com', title: 'Backend Software Engineer', exp: 5, loc: 'Seattle, WA', skills: ['Go', 'Python', 'Kubernetes', 'gRPC'] },
    { name: 'Jordan Lee', email: 'jordan.lee@example.com', title: 'Product Manager', exp: 5, loc: 'Austin, TX', skills: ['Roadmapping', 'Agile', 'Product Strategy', 'Data Analytics'] },
    { name: 'Sophia Martinez', email: 'sophia.m@example.com', title: 'DevOps & Cloud Engineer', exp: 6, loc: 'Remote, US', skills: ['AWS', 'Terraform', 'CI/CD', 'Linux'] },
    { name: 'David Kim', email: 'david.kim@example.com', title: 'Frontend Developer', exp: 3, loc: 'San Jose, CA', skills: ['JavaScript', 'Vue.js', 'CSS Grid', 'REST APIs'] },
    { name: 'Aisha Al-Mansoor', email: 'aisha.m@example.com', title: 'Content Marketing Specialist', exp: 3, loc: 'Chicago, IL', skills: ['SEO', 'Copywriting', 'Content Strategy', 'HubSpot'] },
    { name: 'Noah Taylor', email: 'noah.taylor@example.com', title: 'Enterprise Account Executive', exp: 4, loc: 'New York, NY', skills: ['B2B Sales', 'Salesforce', 'Negotiation', 'CRM'] },
    { name: 'Olivia Wilson', email: 'olivia.w@example.com', title: 'QA Automation Engineer', exp: 3, loc: 'Remote, US', skills: ['Cypress', 'Playwright', 'Jest', 'Python'] },
    { name: 'Lucas Silva', email: 'lucas.silva@example.com', title: 'Junior UI/UX Designer', exp: 1, loc: 'Boston, MA', skills: ['Figma', 'Prototyping', 'Wireframing'] },
    { name: 'Emma Davis', email: 'emma.davis@example.com', title: 'Data Scientist', exp: 4, loc: 'Boston, MA', skills: ['Python', 'Machine Learning', 'SQL', 'Pandas'] },
    { name: 'James Brown', email: 'james.b@example.com', title: 'Senior Backend Engineer', exp: 8, loc: 'Austin, TX', skills: ['Java', 'Spring Boot', 'Microservices', 'Kafka'] },
    { name: 'Isabella Garcia', email: 'isabella.g@example.com', title: 'Customer Success Manager', exp: 3, loc: 'Denver, CO', skills: ['Customer Retention', 'Zendesk', 'Onboarding'] },
    { name: 'Benjamin Jones', email: 'ben.jones@example.com', title: 'Senior DevOps Architect', exp: 7, loc: 'Remote, US', skills: ['AWS', 'Docker', 'Kubernetes', 'Ansible'] },
    { name: 'Mia Johnson', email: 'mia.j@example.com', title: 'Full Stack Engineer', exp: 4, loc: 'San Francisco, CA', skills: ['React', 'Node.js', 'MongoDB', 'GraphQL'] },
    { name: 'Ethan White', email: 'ethan.w@example.com', title: 'Mobile Developer', exp: 5, loc: 'Seattle, WA', skills: ['React Native', 'Swift', 'Kotlin', 'Mobile UI'] },
    { name: 'Charlotte Miller', email: 'charlotte.m@example.com', title: 'Product Marketing Manager', exp: 5, loc: 'New York, NY', skills: ['GTM Strategy', 'Campaigns', 'Analytics'] },
    { name: 'Daniel Martin', email: 'daniel.m@example.com', title: 'Cloud Security Analyst', exp: 4, loc: 'Remote, US', skills: ['Cybersecurity', 'AWS IAM', 'Compliance', 'Pen Testing'] },
    { name: 'Harper Jackson', email: 'harper.j@example.com', title: 'UX Researcher', exp: 4, loc: 'Chicago, IL', skills: ['Usability Testing', 'User Interviews', 'Personas'] },
    { name: 'Matthew Anderson', email: 'matthew.a@example.com', title: 'Site Reliability Engineer', exp: 6, loc: 'Austin, TX', skills: ['Prometheus', 'Grafana', 'Linux', 'Terraform'] },
    { name: 'Amelia Harris', email: 'amelia.h@example.com', title: 'Frontend Developer', exp: 2, loc: 'Remote, US', skills: ['JavaScript', 'HTML/CSS', 'Tailwind', 'Git'] },
    { name: 'Henry Clark', email: 'henry.c@example.com', title: 'Sales Development Rep', exp: 2, loc: 'Atlanta, GA', skills: ['Cold Calling', 'Lead Gen', 'Salesforce'] },
    { name: 'Evelyn Lewis', email: 'evelyn.l@example.com', title: 'Technical Writer', exp: 3, loc: 'Remote, US', skills: ['Documentation', 'Markdown', 'API Docs'] },
    { name: 'Alexander Young', email: 'alex.young@example.com', title: 'Systems Architect', exp: 9, loc: 'San Francisco, CA', skills: ['Distributed Systems', 'Go', 'Cloud Architecture'] }
  ];

  const candidateProfiles = [];

  candidateNames.forEach((c, idx) => {
    const id = `usr_cand_${idx + 1}`;
    users.push({
      id,
      name: c.name,
      email: c.email,
      passwordHash: INITIAL_PASSWORD_HASH,
      role: 'candidate',
      companyId: null,
      active: true,
      createdAt: subDays(80 - idx * 2),
      lastLoginAt: subDays(Math.max(1, idx))
    });

    candidateProfiles.push({
      userId: id,
      phone: `+1 (555) 01${String(idx + 10).padStart(2, '0')}`,
      location: c.loc,
      headline: `${c.title} • ${c.exp} yrs exp`,
      skills: c.skills,
      experienceYears: c.exp,
      education: 'B.S. in Computer Science or related degree',
      linkedin: `https://linkedin.example.com/in/${c.name.toLowerCase().replace(/\s+/g, '-')}`,
      resumeMeta: {
        fileName: `${c.name.replace(/\s+/g, '_')}_Resume.pdf`,
        sizeBytes: 1048576 + (idx * 25000),
        mimeType: 'application/pdf',
        uploadedAt: subDays(70 - idx * 2)
      }
    });
  });

  // 3. Jobs (12 items)
  const jobs = [
    {
      id: 'job_1',
      companyId: 'comp_1',
      title: 'Senior Full Stack Engineer',
      department: 'Engineering',
      location: 'Remote, US',
      type: 'Full-time',
      experience: '5+',
      salaryMin: 130000,
      salaryMax: 165000,
      description: 'We are seeking an experienced Full Stack Engineer to lead the architecture and implementation of mission-critical features on our high-scale cloud platforms.',
      requirements: ['5+ years web application development', 'Proficiency in modern JavaScript / TypeScript', 'Experience with SQL and relational databases', 'Demonstrated mentoring skills'],
      skills: ['JavaScript', 'Node.js', 'React', 'PostgreSQL', 'Docker'],
      status: 'published',
      postedAt: subDays(60),
      closesAt: addDays(30),
      createdBy: 'usr_hr_1'
    },
    {
      id: 'job_2',
      companyId: 'comp_1',
      title: 'Lead Product Designer',
      department: 'Design',
      location: 'New York, NY',
      type: 'Full-time',
      experience: '5+',
      salaryMin: 125000,
      salaryMax: 155000,
      description: 'Join our design org to lead product design systems, user journey mapping, and craft delightful interactions across web and mobile surfaces.',
      requirements: ['5+ years UI/UX design', 'Expertise in Figma design systems', 'Deep user research background', 'Strong portfolio'],
      skills: ['Figma', 'UI/UX', 'Design Systems', 'User Research'],
      status: 'published',
      postedAt: subDays(55),
      closesAt: addDays(25),
      createdBy: 'usr_hr_1'
    },
    {
      id: 'job_3',
      companyId: 'comp_1',
      title: 'Frontend Developer (Vanilla / Modern JS)',
      department: 'Engineering',
      location: 'San Francisco, CA',
      type: 'Full-time',
      experience: '3-5',
      salaryMin: 105000,
      salaryMax: 135000,
      description: 'Focus on pure performance, accessibility (WCAG AA), and modular vanilla JavaScript web applications that run lightning-fast on any device.',
      requirements: ['3+ years frontend web engineering', 'Mastery of semantic HTML5, CSS3, and ES modules', 'Deep commitment to web accessibility and performance'],
      skills: ['JavaScript', 'HTML5', 'CSS3', 'Web Accessibility', 'Performance'],
      status: 'published',
      postedAt: subDays(50),
      closesAt: addDays(40),
      createdBy: 'usr_hr_2'
    },
    {
      id: 'job_4',
      companyId: 'comp_1',
      title: 'Backend Engineer (Go / Distributed Systems)',
      department: 'Engineering',
      location: 'Remote, US',
      type: 'Full-time',
      experience: '3-5',
      salaryMin: 115000,
      salaryMax: 145000,
      description: 'Help scale our high-throughput backend services and event-driven architecture using Go and cloud native tooling.',
      requirements: ['3+ years backend development', 'Experience with Go or Java/Rust', 'Solid understanding of concurrency and caching'],
      skills: ['Go', 'Kubernetes', 'gRPC', 'PostgreSQL', 'Redis'],
      status: 'published',
      postedAt: subDays(45),
      closesAt: addDays(45),
      createdBy: 'usr_hr_2'
    },
    {
      id: 'job_5',
      companyId: 'comp_1',
      title: 'Product Manager (Growth & Lifecycle)',
      department: 'Product',
      location: 'Austin, TX',
      type: 'Full-time',
      experience: '3-5',
      salaryMin: 110000,
      salaryMax: 140000,
      description: 'Drive conversion, retention, and feature adoption across all user personas in our B2B SaaS ecosystem.',
      requirements: ['3+ years in software product management', 'Data-driven mindset with analytics expertise', 'Excellent cross-functional leadership'],
      skills: ['Product Strategy', 'Agile', 'User Analytics', 'A/B Testing'],
      status: 'published',
      postedAt: subDays(40),
      closesAt: addDays(50),
      createdBy: 'usr_hr_1'
    },
    {
      id: 'job_6',
      companyId: 'comp_1',
      title: 'DevOps & Cloud Infrastructure Architect',
      department: 'Infrastructure',
      location: 'Remote, US',
      type: 'Full-time',
      experience: '5+',
      salaryMin: 135000,
      salaryMax: 170000,
      description: 'Own AWS cloud architecture, CI/CD pipelines, security compliance, and zero-downtime deployment pipelines.',
      requirements: ['5+ years infrastructure engineering', 'Deep AWS and Terraform experience', 'Container orchestration with Kubernetes'],
      skills: ['AWS', 'Terraform', 'Kubernetes', 'CI/CD', 'Docker'],
      status: 'published',
      postedAt: subDays(35),
      closesAt: addDays(60),
      createdBy: 'usr_hr_2'
    },
    {
      id: 'job_7',
      companyId: 'comp_1',
      title: 'Content Marketing Manager',
      department: 'Marketing',
      location: 'Chicago, IL',
      type: 'Full-time',
      experience: '1-3',
      salaryMin: 75000,
      salaryMax: 95000,
      description: 'Produce high-converting blogs, whitepapers, case studies, and email campaigns to amplify our brand presence.',
      requirements: ['2+ years content marketing experience', 'Proven editorial and copywriting portfolio', 'Familiarity with SEO and CMS platforms'],
      skills: ['Content Marketing', 'SEO', 'Copywriting', 'HubSpot'],
      status: 'published',
      postedAt: subDays(30),
      closesAt: addDays(30),
      createdBy: 'usr_hr_1'
    },
    {
      id: 'job_8',
      companyId: 'comp_1',
      title: 'Enterprise Account Executive',
      department: 'Sales',
      location: 'New York, NY',
      type: 'Full-time',
      experience: '3-5',
      salaryMin: 95000,
      salaryMax: 150000,
      description: 'Prospect and close high-value annual contracts with Fortune 500 enterprise customers.',
      requirements: ['3+ years SaaS sales closing quota', 'Proven track record of beating quota', 'Deep knowledge of enterprise sales cycles'],
      skills: ['B2B Sales', 'Salesforce', 'Negotiation', 'CRM'],
      status: 'published',
      postedAt: subDays(28),
      closesAt: addDays(35),
      createdBy: 'usr_hr_2'
    },
    {
      id: 'job_9',
      companyId: 'comp_1',
      title: 'QA Automation Engineer',
      department: 'Engineering',
      location: 'Remote, US',
      type: 'Contract',
      experience: '1-3',
      salaryMin: 70000,
      salaryMax: 90000,
      description: 'Build robust end-to-end regression test suites using modern test automation frameworks.',
      requirements: ['2+ years test automation', 'Hands-on experience with Playwright or Cypress', 'CI integration knowledge'],
      skills: ['Cypress', 'Playwright', 'Jest', 'Test Automation'],
      status: 'published',
      postedAt: subDays(25),
      closesAt: addDays(40),
      createdBy: 'usr_hr_1'
    },
    {
      id: 'job_10',
      companyId: 'comp_1',
      title: 'UI/UX Design Intern',
      department: 'Design',
      location: 'Remote, US',
      type: 'Internship',
      experience: '0-1',
      salaryMin: 40000,
      salaryMax: 55000,
      description: 'Exciting 6-month paid internship working directly with our lead designers on web design systems and UI prototypes.',
      requirements: ['Enrolled in or recent graduate of design degree/bootcamp', 'Proficiency in Figma', 'Eagerness to learn in a fast-paced environment'],
      skills: ['Figma', 'Wireframing', 'Prototyping'],
      status: 'published',
      postedAt: subDays(20),
      closesAt: addDays(20),
      createdBy: 'usr_hr_1'
    },
    {
      id: 'job_11',
      companyId: 'comp_1',
      title: 'Data Scientist (Machine Learning)',
      department: 'Engineering',
      location: 'Boston, MA',
      type: 'Full-time',
      experience: '3-5',
      salaryMin: 125000,
      salaryMax: 160000,
      description: 'Develop intelligent predictive models and matching algorithms for talent analytics.',
      requirements: ['Master degree in CS/Stats/Math', 'Python, Scikit-learn, PyTorch', 'Experience deploying models in production'],
      skills: ['Python', 'Machine Learning', 'SQL', 'PyTorch'],
      status: 'draft',
      postedAt: subDays(10),
      closesAt: addDays(60),
      createdBy: 'usr_hr_1'
    },
    {
      id: 'job_12',
      companyId: 'comp_1',
      title: 'Customer Success Specialist',
      department: 'Customer Support',
      location: 'Remote, US',
      type: 'Part-time',
      experience: '1-3',
      salaryMin: 50000,
      salaryMax: 65000,
      description: 'Help customers maximize value through prompt onboarding, troubleshooting, and support guidance.',
      requirements: ['1+ years in client support', 'Excellent empathy and written communication'],
      skills: ['Customer Support', 'Zendesk', 'Client Relations'],
      status: 'closed',
      postedAt: subDays(75),
      closesAt: subDays(5),
      createdBy: 'usr_hr_2'
    }
  ];

  // 4. Offer Templates
  const offerTemplates = [
    {
      id: 'tmpl_standard',
      name: 'Standard Full-Time Offer',
      body: `Dear {{candidate_name}},

We are thrilled to extend an offer of employment for the position of {{job_title}} at {{company_name}}!

Here are the key terms of your employment:
- Position: {{job_title}}
- Annual Salary: \${{salary}} USD
- Target Start Date: {{start_date}}
- Reporting Manager: Engineering / Department Lead
- Benefits: Full Health, Dental, Vision, 401(k) matching, and flexible PTO

Please review and confirm your acceptance below by your start date.

Sincerely,
{{hr_name}}
Talent Acquisition, {{company_name}}`
    }
  ];

  // 5. Applications, Stage History, Interviews, Offers, Onboarding Tasks, Notifications, Activity Log
  const applications = [];
  const stageHistory = [];
  const interviews = [];
  const interviewFeedback = [];
  const offers = [];
  const onboardingTasks = [];
  const notifications = [];
  const activityLog = [];

  const stagesPool = [
    'Applied', 'Screening', 'Interview', 'Selected', 'Offered', 'Rejected', 'Withdrawn'
  ];

  let appIdCounter = 1;
  let histIdCounter = 1;
  let intIdCounter = 1;
  let offerIdCounter = 1;
  let notifIdCounter = 1;
  let actIdCounter = 1;

  // Distribute applications systematically across candidates and jobs
  // Every candidate gets 2-4 applications, ensuring ~70 applications total
  const stageDistribution = [
    'Offered', 'Selected', 'Interview', 'Screening', 'Applied',
    'Interview', 'Screening', 'Applied', 'Rejected', 'Withdrawn',
    'Interview', 'Selected', 'Applied', 'Screening', 'Offered'
  ];

  for (let cIdx = 0; cIdx < candidateProfiles.length; cIdx++) {
    const cand = candidateProfiles[cIdx];
    const numApps = (cIdx % 3) + 2; // 2 to 4 apps each

    for (let a = 0; a < numApps; a++) {
      const jobIdx = (cIdx + a * 3) % jobs.length;
      const job = jobs[jobIdx];
      const appId = `app_${appIdCounter++}`;
      
      const assignedStage = stageDistribution[(cIdx * 3 + a) % stageDistribution.length];
      const appliedDaysAgo = 80 - (cIdx * 2 + a * 3);
      const appliedAt = subDays(Math.max(appliedDaysAgo, 5));

      const rating = (cIdx % 5) + 1; // 1 to 5 rating

      applications.push({
        id: appId,
        jobId: job.id,
        candidateId: cand.userId,
        stage: assignedStage,
        coverNote: `I am thrilled to apply for the ${job.title} role. My experience in ${cand.skills.slice(0, 3).join(', ')} aligns strongly with your requirements.`,
        resumeMeta: cand.resumeMeta,
        appliedAt,
        updatedAt: subDays(Math.max(appliedDaysAgo - 8, 1)),
        rating
      });

      // Audit Trail (stageHistory) - strictly append-only
      stageHistory.push({
        id: `hist_${histIdCounter++}`,
        applicationId: appId,
        fromStage: null,
        toStage: 'Applied',
        actorId: cand.userId,
        note: 'Application submitted online',
        at: appliedAt
      });

      if (assignedStage !== 'Applied') {
        const screenDate = subDays(Math.max(appliedDaysAgo - 3, 4));
        stageHistory.push({
          id: `hist_${histIdCounter++}`,
          applicationId: appId,
          fromStage: 'Applied',
          toStage: 'Screening',
          actorId: 'usr_hr_1',
          note: 'Resume matches core criteria. Moving to initial screening.',
          at: screenDate
        });

        if (['Interview', 'Selected', 'Offered', 'Rejected', 'Withdrawn'].includes(assignedStage)) {
          const intDate = subDays(Math.max(appliedDaysAgo - 6, 3));
          
          // Seed Interview record
          const intId = `int_${intIdCounter++}`;
          const isUpcoming = (cIdx % 4 === 0);
          const intStartsAt = isUpcoming ? addDays(2 + a) : subDays(Math.max(appliedDaysAgo - 7, 2));

          interviews.push({
            id: intId,
            applicationId: appId,
            title: `Technical & Cultural Interview - ${job.title}`,
            startsAt: intStartsAt,
            durationMin: 45,
            mode: a % 2 === 0 ? 'Video' : 'Phone',
            location: a % 2 === 0 ? 'https://meet.example.com/hireflow-interview' : '+1 555-0100 ext 44',
            participants: ['usr_hr_1', 'usr_hr_2'],
            status: isUpcoming ? 'scheduled' : 'completed',
            createdBy: 'usr_hr_1',
            updatedAt: intStartsAt
          });

          stageHistory.push({
            id: `hist_${histIdCounter++}`,
            applicationId: appId,
            fromStage: 'Screening',
            toStage: 'Interview',
            actorId: 'usr_hr_1',
            note: 'Screening passed. Scheduled panel interview.',
            at: intDate
          });

          if (!isUpcoming) {
            interviewFeedback.push({
              id: `fb_${intId}`,
              interviewId: intId,
              authorId: 'usr_hr_1',
              rating: Math.min(5, rating + 1),
              recommendation: rating >= 4 ? 'Strong yes' : (rating >= 3 ? 'Yes' : 'No'),
              comments: 'Candidate demonstrated deep conceptual clarity and great collaborative communication skills.',
              at: intDate
            });
          }

          if (['Selected', 'Offered'].includes(assignedStage)) {
            const selectDate = subDays(Math.max(appliedDaysAgo - 10, 2));
            stageHistory.push({
              id: `hist_${histIdCounter++}`,
              applicationId: appId,
              fromStage: 'Interview',
              toStage: 'Selected',
              actorId: 'usr_hr_2',
              note: 'Interview feedback positive. Selected for offer generation.',
              at: selectDate
            });

            if (assignedStage === 'Offered') {
              const offerDate = subDays(Math.max(appliedDaysAgo - 14, 1));
              const offerSalary = Math.round((job.salaryMin + job.salaryMax) / 2);
              const offerId = `off_${offerIdCounter++}`;
              const offerStatus = cIdx % 2 === 0 ? 'accepted' : 'issued';

              offers.push({
                id: offerId,
                applicationId: appId,
                templateId: 'tmpl_standard',
                salary: offerSalary,
                startDate: addDays(14),
                status: offerStatus,
                renderedBody: offerTemplates[0].body
                  .replace('{{candidate_name}}', users.find(u => u.id === cand.userId)?.name || 'Candidate')
                  .replace(/{{job_title}}/g, job.title)
                  .replace(/{{company_name}}/g, companies[0].name)
                  .replace('{{salary}}', offerSalary.toLocaleString())
                  .replace('{{start_date}}', addDays(14).split('T')[0])
                  .replace('{{hr_name}}', 'Elena Rostova'),
                issuedAt: offerDate,
                respondedAt: offerStatus === 'accepted' ? subDays(Math.max(appliedDaysAgo - 16, 0)) : null
              });

              // Add Onboarding Tasks for accepted offers
              if (offerStatus === 'accepted') {
                onboardingTasks.push(
                  { id: `task_${offerId}_1`, offerId, title: 'Submit signed direct deposit form', owner: 'candidate', dueDate: addDays(10), done: true },
                  { id: `task_${offerId}_2`, offerId, title: 'Upload Government-issued photo ID', owner: 'candidate', dueDate: addDays(12), done: false },
                  { id: `task_${offerId}_3`, offerId, title: 'Provision IT developer hardware and credentials', owner: 'hr', dueDate: addDays(13), done: false },
                  { id: `task_${offerId}_4`, offerId, title: 'Schedule 30-day orientation buddy sync', owner: 'hr', dueDate: addDays(14), done: false }
                );
              }

              stageHistory.push({
                id: `hist_${histIdCounter++}`,
                applicationId: appId,
                fromStage: 'Selected',
                toStage: 'Offered',
                actorId: 'usr_hr_1',
                note: `Official offer issued ($${offerSalary.toLocaleString()}).`,
                at: offerDate
              });
            }
          } else if (assignedStage === 'Rejected') {
            stageHistory.push({
              id: `hist_${histIdCounter++}`,
              applicationId: appId,
              fromStage: 'Interview',
              toStage: 'Rejected',
              actorId: 'usr_hr_1',
              note: 'Profile did not meet required senior experience benchmark.',
              at: subDays(Math.max(appliedDaysAgo - 12, 1))
            });
          } else if (assignedStage === 'Withdrawn') {
            stageHistory.push({
              id: `hist_${histIdCounter++}`,
              applicationId: appId,
              fromStage: 'Interview',
              toStage: 'Withdrawn',
              actorId: cand.userId,
              note: 'Candidate accepted competing local offer.',
              at: subDays(Math.max(appliedDaysAgo - 12, 1))
            });
          }
        }
      }

      // Enqueue Mock Notifications (~15% failed for demo retry capability)
      const isFailed = (notifIdCounter % 7 === 0);
      notifications.push({
        id: `notif_${notifIdCounter++}`,
        type: 'stage_update',
        toUserId: cand.userId,
        subject: `Update on your application for ${job.title} at ${companies[0].name}`,
        body: `Hello, your application has progressed to stage: ${assignedStage}. Please check your portal for next steps.`,
        status: isFailed ? 'failed' : 'sent',
        attempts: isFailed ? 1 : 1,
        lastError: isFailed ? 'Connection timeout to mock mail gateway' : null,
        createdAt: appliedAt,
        sentAt: isFailed ? null : appliedAt
      });

      // System Activity Entry
      activityLog.push({
        id: `act_${actIdCounter++}`,
        actorId: 'usr_hr_1',
        action: 'application.stage_changed',
        entityType: 'application',
        entityId: appId,
        at: appliedAt,
        meta: { jobTitle: job.title, stage: assignedStage }
      });
    }
  }

  return {
    companies,
    users,
    jobs,
    candidateProfiles,
    applications,
    stageHistory,
    interviews,
    interviewFeedback,
    offerTemplates,
    offers,
    onboardingTasks,
    notifications,
    activityLog
  };
}

/**
 * Initializes or resets the database in localStorage
 * @param {boolean} forceReset 
 */
function initDatabase(forceReset = false) {
  const existing = storage.get(DB_KEY, null);
  if (!existing || forceReset) {
    const seed = generateSeedData();
    storage.set(DB_KEY, seed);
    return seed;
  }
  return existing;
}

/**
 * Reset demo data helper
 */
function resetDemoData() {
  const seed = generateSeedData();
  storage.set(DB_KEY, seed);
  sessionStorage.removeItem('hireflow_banner_dismissed');
  return seed;
}

/* js/core/permissions.js */
/**
 * HireFlow Role & Permission Matrix (permissions.js)
 * Defines strictly what each role (admin, hr, candidate) is allowed to perform.
 * Client-side role guards are for demo purposes; api.js enforces these checks.
 */

const ROLES = {
  ADMIN: 'admin',
  HR: 'hr',
  CANDIDATE: 'candidate'
};

/**
 * Permission lookup table
 * [action]: [allowed roles]
 */
const PERMISSIONS = {
  // Admin only
  'users.manage': [ROLES.ADMIN],
  'company.configure': [ROLES.ADMIN],
  'notifications.view': [ROLES.ADMIN],
  'notifications.retry': [ROLES.ADMIN],
  'settings.manage': [ROLES.ADMIN],

  // Shared Admin & HR
  'activity.view': [ROLES.ADMIN, ROLES.HR],
  'analytics.view': [ROLES.ADMIN, ROLES.HR],
  'jobs.view': [ROLES.ADMIN, ROLES.HR, ROLES.CANDIDATE], // Candidate only sees published

  // HR only
  'jobs.create': [ROLES.HR],
  'jobs.edit': [ROLES.HR],
  'jobs.publish': [ROLES.HR],
  'jobs.close': [ROLES.HR],
  'jobs.archive': [ROLES.HR],
  'jobs.duplicate': [ROLES.HR],
  'applications.view': [ROLES.HR, ROLES.ADMIN],
  'applications.move': [ROLES.HR],
  'candidates.search': [ROLES.HR],
  'candidates.view': [ROLES.HR],
  'interviews.manage': [ROLES.HR],
  'offers.manage': [ROLES.HR],
  'onboarding.manage': [ROLES.HR],

  // Candidate only (own data scope)
  'applications.create': [ROLES.CANDIDATE],
  'applications.withdraw': [ROLES.CANDIDATE],
  'profile.edit': [ROLES.CANDIDATE],
  'interviews.view': [ROLES.CANDIDATE, ROLES.HR, ROLES.ADMIN],
  'offers.respond': [ROLES.CANDIDATE]
};

/**
 * Checks whether a given role has permission for an action
 * @param {string} role 'admin' | 'hr' | 'candidate'
 * @param {string} action 
 * @returns {boolean}
 */
function can(role, action) {
  if (!role) return false;
  const allowed = PERMISSIONS[action];
  if (!allowed) {
    console.warn(`[Permissions] Unknown action requested: "${action}"`);
    return false;
  }
  return allowed.includes(role);
}

/* js/core/auth.js */
/**
 * HireFlow Authentication Service (auth.js)
 * Manages user logins, session tokens, lockout simulation (5 tries = 30s lock),
 * and demo credentials.
 */


const LOCKOUT_KEY = 'hireflow_lockout_info';

const auth = {
  /**
   * Check lockout state
   * @returns {{ isLocked: boolean, remainingSeconds: number }}
   */
  getLockoutStatus() {
    const info = storage.get(LOCKOUT_KEY, { attempts: 0, lockedUntil: null });
    if (info.lockedUntil) {
      const remainingMs = new Date(info.lockedUntil).getTime() - Date.now();
      if (remainingMs > 0) {
        return { isLocked: true, remainingSeconds: Math.ceil(remainingMs / 1000) };
      }
      // Lockout expired
      storage.set(LOCKOUT_KEY, { attempts: 0, lockedUntil: null });
    }
    return { isLocked: false, remainingSeconds: 0 };
  },

  /**
   * Records a failed login attempt; locks for 30s after 5 failures
   */
  recordFailedAttempt() {
    const info = storage.get(LOCKOUT_KEY, { attempts: 0, lockedUntil: null });
    info.attempts += 1;
    if (info.attempts >= 5) {
      info.lockedUntil = new Date(Date.now() + 30 * 1000).toISOString();
    }
    storage.set(LOCKOUT_KEY, info);
    return info;
  },

  /**
   * Resets failed attempt counter on success
   */
  resetAttempts() {
    storage.remove(LOCKOUT_KEY);
  },

  /**
   * Authenticate user with email and password
   * @param {string} email 
   * @param {string} password 
   * @param {boolean} rememberMe 
   * @returns {Promise<{ success: boolean, user?: Object, error?: string }>}
   */
  async login(email, password, rememberMe = false) {
    const lock = this.getLockoutStatus();
    if (lock.isLocked) {
      return {
        success: false,
        error: `Too many failed attempts. Account temporarily locked. Please wait ${lock.remainingSeconds} seconds.`
      };
    }

    const db = storage.get(DB_KEY);
    if (!db) {
      return { success: false, error: 'Database not initialized. Please refresh.' };
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const hash = mockHash(password);
    const user = db.users.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user || user.passwordHash !== hash || !user.active) {
      this.recordFailedAttempt();
      return { success: false, error: 'Invalid email or password' };
    }

    this.resetAttempts();

    // Session duration: 7 days if rememberMe, 2 hours otherwise
    const durationMs = rememberMe ? (7 * 24 * 60 * 60 * 1000) : (2 * 60 * 60 * 1000);
    const session = {
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      expiresAt: new Date(Date.now() + durationMs).toISOString()
    };

    storage.set(SESSION_KEY, session);

    // Update lastLoginAt in DB
    user.lastLoginAt = new Date().toISOString();
    storage.set(DB_KEY, db);

    return { success: true, user: session };
  },

  /**
   * End current user session
   */
  logout() {
    storage.remove(SESSION_KEY);
  },

  /**
   * Returns current active session or null if missing/expired
   * @returns {Object|null}
   */
  getSession() {
    const session = storage.get(SESSION_KEY, null);
    if (!session) return null;

    // Check expiration
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      this.logout();
      return null;
    }
    return session;
  },

  /**
   * Returns full user profile from database for currently logged in session
   * @returns {Object|null}
   */
  getCurrentUser() {
    const session = this.getSession();
    if (!session) return null;

    const db = storage.get(DB_KEY);
    if (!db) return null;

    return db.users.find(u => u.id === session.userId) || null;
  }
};

/* js/core/pipeline.js */
/**
 * HireFlow Recruitment Pipeline Rules Engine (pipeline.js)
 * Enforces stage transition validation, forward movement guards, terminal states,
 * and immutable audit logging.
 */


const PIPELINE_STAGES = [
  'Applied',
  'Screening',
  'Interview',
  'Selected',
  'Offered',
  'Rejected',
  'Withdrawn'
];

const STAGE_CONFIG = {
  Applied: { label: 'Applied', color: 'var(--stage-applied)', bg: 'var(--stage-applied-bg)' },
  Screening: { label: 'Screening', color: 'var(--stage-screening)', bg: 'var(--stage-screening-bg)' },
  Interview: { label: 'Interview', color: 'var(--stage-interview)', bg: 'var(--stage-interview-bg)' },
  Selected: { label: 'Selected', color: 'var(--stage-selected)', bg: 'var(--stage-selected-bg)' },
  Offered: { label: 'Offered', color: 'var(--stage-offered)', bg: 'var(--stage-offered-bg)' },
  Rejected: { label: 'Rejected', color: 'var(--stage-rejected)', bg: 'var(--stage-rejected-bg)' },
  Withdrawn: { label: 'Withdrawn', color: 'var(--stage-withdrawn)', bg: 'var(--stage-withdrawn-bg)' }
};

/**
 * Returns list of allowed destination stages from a given current stage
 * @param {string} currentStage 
 * @param {string} userRole 
 * @returns {string[]}
 */
function getAllowedTransitions(currentStage, userRole = 'hr') {
  if (userRole === 'candidate') {
    // Candidates can only withdraw an active application
    if (['Rejected', 'Withdrawn'].includes(currentStage)) return [];
    return ['Withdrawn'];
  }

  switch (currentStage) {
    case 'Applied':
      return ['Screening', 'Rejected'];
    case 'Screening':
      return ['Interview', 'Rejected', 'Applied']; // Applied is revert
    case 'Interview':
      return ['Selected', 'Rejected', 'Screening']; // Screening is revert
    case 'Selected':
      return ['Offered', 'Rejected', 'Interview']; // Interview is revert
    case 'Offered':
      return ['Rejected']; // only if declined/withdrawn
    case 'Rejected':
    case 'Withdrawn':
      return []; // Terminal states: cannot transition out
    default:
      return [];
  }
}

/**
 * Validates whether a candidate transition is allowed and meets required business guards
 * @param {Object} db 
 * @param {string} applicationId 
 * @param {string} toStage 
 * @param {string} userRole 
 * @returns {{ allowed: boolean, reason?: string, requiresAction?: string }}
 */
function validateTransition(db, applicationId, toStage, userRole = 'hr') {
  const app = db.applications.find(a => a.id === applicationId);
  if (!app) return { allowed: false, reason: 'Application not found' };

  const currentStage = app.stage;
  if (currentStage === toStage) return { allowed: true };

  const allowedStages = getAllowedTransitions(currentStage, userRole);
  if (!allowedStages.includes(toStage)) {
    return {
      allowed: false,
      reason: `Direct transition from ${currentStage} to ${toStage} is not permitted.`
    };
  }

  // Guard: Cannot move to Interview without at least one scheduled/completed interview
  if (toStage === 'Interview') {
    const hasInterview = db.interviews.some(i => i.applicationId === applicationId && i.status !== 'cancelled');
    if (!hasInterview) {
      return {
        allowed: false,
        reason: 'Candidates cannot move to Interview stage without scheduling an interview first.',
        requiresAction: 'schedule_interview'
      };
    }
  }

  // Guard: Cannot move to Offered unless an offer record exists in draft or issued state
  if (toStage === 'Offered') {
    const hasOffer = db.offers.some(o => o.applicationId === applicationId && ['draft', 'issued', 'accepted'].includes(o.status));
    if (!hasOffer) {
      return {
        allowed: false,
        reason: 'Candidates cannot move to Offered stage without creating an offer letter first.',
        requiresAction: 'create_offer'
      };
    }
  }

  return { allowed: true };
}

/**
 * Records an immutable stage change with audit log and mock notification
 * @param {string} applicationId 
 * @param {string} fromStage 
 * @param {string} toStage 
 * @param {string} actorId 
 * @param {string} note 
 * @returns {boolean}
 */
function recordStageChange(applicationId, fromStage, toStage, actorId, note = '') {
  const db = storage.get(DB_KEY);
  if (!db) return false;

  const app = db.applications.find(a => a.id === applicationId);
  if (!app) return false;

  const now = new Date().toISOString();

  // 1. Update application record
  app.stage = toStage;
  app.updatedAt = now;

  // 2. Append to stageHistory (Audit Trail)
  const historyEntry = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    applicationId,
    fromStage,
    toStage,
    actorId,
    note: note || `Moved from ${fromStage} to ${toStage}`,
    at: now
  };
  db.stageHistory.push(historyEntry);

  // 3. Append to system Activity Log
  const job = db.jobs.find(j => j.id === app.jobId);
  db.activityLog.push({
    id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    actorId,
    action: 'application.stage_changed',
    entityType: 'application',
    entityId: applicationId,
    at: now,
    meta: {
      fromStage,
      toStage,
      jobTitle: job ? job.title : 'Job',
      candidateId: app.candidateId
    }
  });

  // 4. Enqueue mock notification to candidate
  db.notifications.push({
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    type: 'stage_update',
    toUserId: app.candidateId,
    subject: `Application update: ${job ? job.title : 'Job'} at Acme Innovations`,
    body: `Hello! Your application has been moved to: ${toStage}. Log in to view details and next steps.`,
    status: Math.random() < 0.15 ? 'failed' : 'sent', // ~15% failure rate for demo retry
    attempts: 1,
    lastError: null,
    createdAt: now,
    sentAt: now
  });

  storage.set(DB_KEY, db);
  return true;
}

/* js/core/api.js */
/**
 * HireFlow API Client Abstraction Layer (api.js)
 * Wraps all data access in asynchronous Promises with realistic network delay (150-350ms).
 * Strictly enforces server-side mimicking role guards and candidate data segregation.
 */


// Artificial delay to simulate real HTTP requests
const delay = (ms = 220) => new Promise(resolve => setTimeout(resolve, ms));

function getDB() {
  let db = storage.get(DB_KEY);
  if (!db) {
    db = initDatabase();
  }
  return db;
}

function saveDB(db) {
  storage.set(DB_KEY, db);
}

function assertPermission(action) {
  const session = auth.getSession();
  const role = session ? session.role : ROLES.CANDIDATE; // public falls back to guest/candidate
  if (!can(role, action)) {
    throw new Error(`Forbidden: You do not have permission to perform "${action}" (Role: ${role})`);
  }
  return session;
}

const api = {
  /* ------------------------------------------------------------------
     1. Jobs API (GET /api/jobs, POST /api/jobs, etc.)
  ------------------------------------------------------------------ */
  async getJobs(filters = {}) {
    await delay();
    const session = auth.getSession();
    const db = getDB();
    let list = [...db.jobs];

    // Candidate or non-logged-in public users only see published & non-expired jobs
    if (!session || session.role === ROLES.CANDIDATE) {
      const now = new Date().toISOString();
      list = list.filter(j => j.status === 'published' && (!j.closesAt || j.closesAt > now));
    }

    // Filters
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(j => 
        j.title.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q) ||
        j.department.toLowerCase().includes(q) ||
        j.skills.some(s => s.toLowerCase().includes(q))
      );
    }
    if (filters.department) {
      list = list.filter(j => j.department.toLowerCase() === filters.department.toLowerCase());
    }
    if (filters.type) {
      list = list.filter(j => j.type.toLowerCase() === filters.type.toLowerCase());
    }
    if (filters.location) {
      list = list.filter(j => j.location.toLowerCase().includes(filters.location.toLowerCase()));
    }
    if (filters.experience) {
      list = list.filter(j => j.experience === filters.experience);
    }
    if (filters.status && (!session || session.role !== ROLES.CANDIDATE)) {
      list = list.filter(j => j.status === filters.status);
    }
    if (filters.minSalary) {
      list = list.filter(j => j.salaryMax >= Number(filters.minSalary));
    }

    // Sort
    if (filters.sortBy === 'salary') {
      list.sort((a, b) => b.salaryMax - a.salaryMax);
    } else {
      // Default newest
      list.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
    }

    return list;
  },

  async getJobById(id) {
    await delay();
    const db = getDB();
    const job = db.jobs.find(j => j.id === id);
    if (!job) throw new Error('Job not found');
    return job;
  },

  async createJob(jobData) {
    await delay();
    const session = assertPermission('jobs.create');
    const db = getDB();

    const newJob = {
      id: `job_${Date.now()}`,
      companyId: 'comp_1',
      title: jobData.title,
      department: jobData.department,
      location: jobData.location,
      type: jobData.type,
      experience: jobData.experience,
      salaryMin: Number(jobData.salaryMin),
      salaryMax: Number(jobData.salaryMax),
      description: jobData.description,
      requirements: Array.isArray(jobData.requirements) ? jobData.requirements : [jobData.requirements],
      skills: Array.isArray(jobData.skills) ? jobData.skills : [],
      status: jobData.status || 'draft',
      postedAt: new Date().toISOString(),
      closesAt: jobData.closesAt || null,
      createdBy: session.userId
    };

    db.jobs.unshift(newJob);

    db.activityLog.push({
      id: `act_${Date.now()}`,
      actorId: session.userId,
      action: 'job.created',
      entityType: 'job',
      entityId: newJob.id,
      at: new Date().toISOString(),
      meta: { title: newJob.title }
    });

    saveDB(db);
    return newJob;
  },

  async updateJob(id, updates) {
    await delay();
    const session = assertPermission('jobs.edit');
    const db = getDB();
    const job = db.jobs.find(j => j.id === id);
    if (!job) throw new Error('Job not found');

    Object.assign(job, updates);

    db.activityLog.push({
      id: `act_${Date.now()}`,
      actorId: session.userId,
      action: 'job.updated',
      entityType: 'job',
      entityId: id,
      at: new Date().toISOString(),
      meta: { title: job.title }
    });

    saveDB(db);
    return job;
  },

  async duplicateJob(id) {
    await delay();
    const session = assertPermission('jobs.duplicate');
    const db = getDB();
    const source = db.jobs.find(j => j.id === id);
    if (!source) throw new Error('Job not found');

    const copy = {
      ...JSON.parse(JSON.stringify(source)),
      id: `job_${Date.now()}`,
      title: `${source.title} (Copy)`,
      status: 'draft',
      postedAt: new Date().toISOString(),
      createdBy: session.userId
    };

    db.jobs.unshift(copy);
    saveDB(db);
    return copy;
  },

  /* ------------------------------------------------------------------
     2. Applications API
  ------------------------------------------------------------------ */
  async getApplications(filters = {}) {
    await delay();
    const session = auth.getSession();
    const db = getDB();
    let list = [...db.applications];

    // Security Rule: Candidates strictly receive ONLY their own applications
    if (session && session.role === ROLES.CANDIDATE) {
      list = list.filter(a => a.candidateId === session.userId);
    } else {
      assertPermission('applications.view');
    }

    if (filters.jobId) {
      list = list.filter(a => a.jobId === filters.jobId);
    }
    if (filters.stage) {
      list = list.filter(a => a.stage === filters.stage);
    }
    if (filters.candidateId) {
      list = list.filter(a => a.candidateId === filters.candidateId);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(a => {
        const user = db.users.find(u => u.id === a.candidateId);
        const candProfile = db.candidateProfiles.find(cp => cp.userId === a.candidateId);
        const nameMatches = user && user.name.toLowerCase().includes(q);
        const skillMatches = candProfile && candProfile.skills.some(s => s.toLowerCase().includes(q));
        return nameMatches || skillMatches;
      });
    }

    // Attach enriched candidate and job data
    return list.map(app => {
      const job = db.jobs.find(j => j.id === app.jobId);
      const user = db.users.find(u => u.id === app.candidateId);
      const profile = db.candidateProfiles.find(cp => cp.userId === app.candidateId);
      return {
        ...app,
        jobTitle: job ? job.title : 'Unknown Job',
        jobDepartment: job ? job.department : '',
        candidateName: user ? user.name : 'Unknown Candidate',
        candidateEmail: user ? user.email : '',
        candidateSkills: profile ? profile.skills : []
      };
    });
  },

  async getApplicationById(id) {
    await delay();
    const session = auth.getSession();
    const db = getDB();
    const app = db.applications.find(a => a.id === id);
    if (!app) throw new Error('Application not found');

    if (session && session.role === ROLES.CANDIDATE && app.candidateId !== session.userId) {
      throw new Error('Forbidden: You can only view your own application');
    }

    const job = db.jobs.find(j => j.id === app.jobId);
    const candidate = db.users.find(u => u.id === app.candidateId);
    const profile = db.candidateProfiles.find(cp => cp.userId === app.candidateId);
    const history = db.stageHistory.filter(h => h.applicationId === id).sort((a, b) => new Date(a.at) - new Date(b.at));
    const appInterviews = db.interviews.filter(i => i.applicationId === id);
    const appOffer = db.offers.find(o => o.applicationId === id);

    return {
      ...app,
      job,
      candidate,
      profile,
      history,
      interviews: appInterviews,
      offer: appOffer
    };
  },

  async applyForJob({ jobId, coverNote, resumeMeta }) {
    await delay();
    const session = assertPermission('applications.create');
    const db = getDB();

    // Prevent duplicate application
    const existing = db.applications.find(a => a.jobId === jobId && a.candidateId === session.userId);
    if (existing) {
      throw new Error('You have already submitted an application for this position.');
    }

    const newAppId = `app_${Date.now()}`;
    const now = new Date().toISOString();

    const newApp = {
      id: newAppId,
      jobId,
      candidateId: session.userId,
      stage: 'Applied',
      coverNote: coverNote || '',
      resumeMeta: resumeMeta || null,
      appliedAt: now,
      updatedAt: now,
      rating: null
    };

    db.applications.push(newApp);

    // Initial audit entry
    db.stageHistory.push({
      id: `hist_${Date.now()}`,
      applicationId: newAppId,
      fromStage: null,
      toStage: 'Applied',
      actorId: session.userId,
      note: 'Application submitted online',
      at: now
    });

    // Mock confirmation email
    db.notifications.push({
      id: `notif_${Date.now()}`,
      type: 'application_submitted',
      toUserId: session.userId,
      subject: 'Application Received - HireFlow',
      body: 'Thank you for applying. The hiring team has received your materials.',
      status: 'sent',
      attempts: 1,
      createdAt: now,
      sentAt: now
    });

    saveDB(db);
    return newApp;
  },

  async moveApplicationStage(applicationId, toStage, note = '') {
    await delay();
    const session = assertPermission('applications.move');
    const db = getDB();

    const validation = validateTransition(db, applicationId, toStage, session.role);
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    const app = db.applications.find(a => a.id === applicationId);
    recordStageChange(applicationId, app.stage, toStage, session.userId, note);
    return { success: true };
  },

  async withdrawApplication(applicationId, note = 'Candidate withdrew application') {
    await delay();
    const session = assertPermission('applications.withdraw');
    const db = getDB();

    const app = db.applications.find(a => a.id === applicationId);
    if (!app || app.candidateId !== session.userId) {
      throw new Error('Application not found or unauthorized');
    }

    if (['Rejected', 'Withdrawn'].includes(app.stage)) {
      throw new Error('Cannot withdraw an application that is already closed');
    }

    recordStageChange(applicationId, app.stage, 'Withdrawn', session.userId, note);
    return { success: true };
  },

  async updateApplicationRating(applicationId, rating) {
    await delay();
    assertPermission('applications.move');
    const db = getDB();
    const app = db.applications.find(a => a.id === applicationId);
    if (!app) throw new Error('Application not found');

    app.rating = Number(rating);
    saveDB(db);
    return app;
  },

  /* ------------------------------------------------------------------
     3. Candidates API
  ------------------------------------------------------------------ */
  async getCandidates(filters = {}) {
    await delay();
    assertPermission('candidates.search');
    const db = getDB();

    const candidateUsers = db.users.filter(u => u.role === ROLES.CANDIDATE);
    let list = candidateUsers.map(u => {
      const profile = db.candidateProfiles.find(cp => cp.userId === u.id) || {};
      const apps = db.applications.filter(a => a.candidateId === u.id);
      return {
        ...u,
        ...profile,
        applicationsCount: apps.length,
        activeApplications: apps.filter(a => !['Rejected', 'Withdrawn'].includes(a.stage)).length
      };
    });

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(c => 
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.headline && c.headline.toLowerCase().includes(q)) ||
        (c.skills && c.skills.some(s => s.toLowerCase().includes(q)))
      );
    }
    if (filters.skill) {
      list = list.filter(c => c.skills && c.skills.includes(filters.skill));
    }

    return list;
  },

  async getCandidateProfile(userId) {
    await delay();
    const session = auth.getSession();
    if (session && session.role === ROLES.CANDIDATE && session.userId !== userId) {
      throw new Error('Forbidden: You can only view your own profile');
    }

    const db = getDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found');

    const profile = db.candidateProfiles.find(cp => cp.userId === userId) || {
      userId,
      phone: '',
      location: '',
      headline: '',
      skills: [],
      experienceYears: 0,
      education: '',
      linkedin: '',
      resumeMeta: null
    };

    return { ...user, ...profile };
  },

  async updateCandidateProfile(userId, profileData) {
    await delay();
    const session = auth.getSession();
    if (session && session.role === ROLES.CANDIDATE && session.userId !== userId) {
      throw new Error('Forbidden: You can only edit your own profile');
    }

    const db = getDB();
    let profile = db.candidateProfiles.find(cp => cp.userId === userId);
    if (!profile) {
      profile = { userId };
      db.candidateProfiles.push(profile);
    }

    Object.assign(profile, profileData);

    // If name was updated
    if (profileData.name) {
      const user = db.users.find(u => u.id === userId);
      if (user) user.name = profileData.name;
    }

    saveDB(db);
    return profile;
  },

  /* ------------------------------------------------------------------
     4. Interviews API
  ------------------------------------------------------------------ */
  async getInterviews(filters = {}) {
    await delay();
    const session = auth.getSession();
    const db = getDB();
    let list = [...db.interviews];

    if (session && session.role === ROLES.CANDIDATE) {
      const myApps = db.applications.filter(a => a.candidateId === session.userId).map(a => a.id);
      list = list.filter(i => myApps.includes(i.applicationId));
    } else {
      assertPermission('interviews.manage');
    }

    // Enrich with job and candidate info
    return list.map(int => {
      const app = db.applications.find(a => a.id === int.applicationId);
      const job = app ? db.jobs.find(j => j.id === app.jobId) : null;
      const candidate = app ? db.users.find(u => u.id === app.candidateId) : null;
      const feedback = db.interviewFeedback.filter(f => f.interviewId === int.id);
      return {
        ...int,
        jobTitle: job ? job.title : 'Interview',
        candidateName: candidate ? candidate.name : 'Candidate',
        feedback
      };
    });
  },

  async scheduleInterview(data) {
    await delay();
    const session = assertPermission('interviews.manage');
    const db = getDB();

    // Conflict detection: verify participants not double booked in the same time slot
    const newStart = new Date(data.startsAt).getTime();
    const newEnd = newStart + (Number(data.durationMin) * 60 * 1000);

    const hasConflict = db.interviews.some(existing => {
      if (existing.status === 'cancelled') return false;
      const exStart = new Date(existing.startsAt).getTime();
      const exEnd = exStart + (existing.durationMin * 60 * 1000);

      const sharesParticipant = existing.participants.some(p => (data.participants || []).includes(p));
      const timesOverlap = (newStart < exEnd && newEnd > exStart);
      return sharesParticipant && timesOverlap;
    });

    if (hasConflict) {
      throw new Error('Interview conflict detected: One or more participants are already scheduled during this time window.');
    }

    const newInterview = {
      id: `int_${Date.now()}`,
      applicationId: data.applicationId,
      title: data.title,
      startsAt: data.startsAt,
      durationMin: Number(data.durationMin),
      mode: data.mode,
      location: data.location,
      participants: data.participants || [session.userId],
      status: 'scheduled',
      createdBy: session.userId,
      updatedAt: new Date().toISOString()
    };

    db.interviews.push(newInterview);

    // Notify candidate
    const app = db.applications.find(a => a.id === data.applicationId);
    if (app) {
      db.notifications.push({
        id: `notif_${Date.now()}`,
        type: 'interview_scheduled',
        toUserId: app.candidateId,
        subject: `Interview Scheduled: ${data.title}`,
        body: `Your interview is scheduled for ${data.startsAt} (${data.mode}). Location/Link: ${data.location}`,
        status: 'sent',
        attempts: 1,
        createdAt: new Date().toISOString(),
        sentAt: new Date().toISOString()
      });
    }

    saveDB(db);
    return newInterview;
  },

  async updateInterviewStatus(id, status) {
    await delay();
    assertPermission('interviews.manage');
    const db = getDB();
    const item = db.interviews.find(i => i.id === id);
    if (!item) throw new Error('Interview not found');

    item.status = status;
    item.updatedAt = new Date().toISOString();
    saveDB(db);
    return item;
  },

  async submitInterviewFeedback(feedbackData) {
    await delay();
    const session = assertPermission('interviews.manage');
    const db = getDB();

    const newFb = {
      id: `fb_${Date.now()}`,
      interviewId: feedbackData.interviewId,
      authorId: session.userId,
      rating: Number(feedbackData.rating),
      recommendation: feedbackData.recommendation,
      comments: feedbackData.comments,
      at: new Date().toISOString()
    };

    db.interviewFeedback.push(newFb);
    saveDB(db);
    return newFb;
  },

  /* ------------------------------------------------------------------
     5. Offers & Onboarding API
  ------------------------------------------------------------------ */
  async getOffers() {
    await delay();
    const session = auth.getSession();
    const db = getDB();
    let list = [...db.offers];

    if (session && session.role === ROLES.CANDIDATE) {
      const myApps = db.applications.filter(a => a.candidateId === session.userId).map(a => a.id);
      list = list.filter(o => myApps.includes(o.applicationId));
    } else {
      assertPermission('offers.manage');
    }

    return list.map(offer => {
      const app = db.applications.find(a => a.id === offer.applicationId);
      const job = app ? db.jobs.find(j => j.id === app.jobId) : null;
      const candidate = app ? db.users.find(u => u.id === app.candidateId) : null;
      const tasks = db.onboardingTasks.filter(t => t.offerId === offer.id);
      return {
        ...offer,
        jobTitle: job ? job.title : 'Job Offer',
        candidateName: candidate ? candidate.name : 'Candidate',
        tasks
      };
    });
  },

  async getOfferTemplates() {
    await delay();
    assertPermission('offers.manage');
    const db = getDB();
    return db.offerTemplates || [];
  },

  async createOffer(offerData) {
    await delay();
    assertPermission('offers.manage');
    const db = getDB();

    const newOffer = {
      id: `off_${Date.now()}`,
      applicationId: offerData.applicationId,
      templateId: offerData.templateId,
      salary: Number(offerData.salary),
      startDate: offerData.startDate,
      status: offerData.status || 'draft',
      renderedBody: offerData.renderedBody,
      issuedAt: offerData.status === 'issued' ? new Date().toISOString() : null,
      respondedAt: null
    };

    db.offers.push(newOffer);
    saveDB(db);
    return newOffer;
  },

  async respondToOffer(offerId, responseAction) { // 'accepted' | 'declined'
    await delay();
    const session = auth.getSession();
    const db = getDB();
    const offer = db.offers.find(o => o.id === offerId);
    if (!offer) throw new Error('Offer not found');

    const app = db.applications.find(a => a.id === offer.applicationId);
    if (session && session.role === ROLES.CANDIDATE && app.candidateId !== session.userId) {
      throw new Error('Forbidden: You can only respond to your own offer');
    }

    if (!['accepted', 'declined'].includes(responseAction)) {
      throw new Error('Invalid response action');
    }

    offer.status = responseAction;
    offer.respondedAt = new Date().toISOString();

    // If accepted, generate default onboarding checklist
    if (responseAction === 'accepted') {
      db.onboardingTasks.push(
        { id: `task_${offer.id}_1`, offerId: offer.id, title: 'Submit signed direct deposit form', owner: 'candidate', dueDate: offer.startDate, done: false },
        { id: `task_${offer.id}_2`, offerId: offer.id, title: 'Upload Government-issued photo ID', owner: 'candidate', dueDate: offer.startDate, done: false },
        { id: `task_${offer.id}_3`, offerId: offer.id, title: 'Provision IT developer hardware and credentials', owner: 'hr', dueDate: offer.startDate, done: false },
        { id: `task_${offer.id}_4`, offerId: offer.id, title: 'Schedule 30-day orientation buddy sync', owner: 'hr', dueDate: offer.startDate, done: false }
      );
    }

    saveDB(db);
    return offer;
  },

  async toggleOnboardingTask(taskId, isDone) {
    await delay();
    const db = getDB();
    const task = db.onboardingTasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');

    task.done = isDone;
    saveDB(db);
    return task;
  },

  /* ------------------------------------------------------------------
     6. Analytics API
  ------------------------------------------------------------------ */
  async getAnalytics(filters = {}) {
    await delay();
    assertPermission('analytics.view');
    const db = getDB();

    const apps = db.applications;
    const offers = db.offers;
    const notifs = db.notifications;

    // Metric 1: Stage conversion
    const stageCounts = {
      Applied: apps.filter(a => a.stage === 'Applied').length,
      Screening: apps.filter(a => a.stage === 'Screening').length,
      Interview: apps.filter(a => a.stage === 'Interview').length,
      Selected: apps.filter(a => a.stage === 'Selected').length,
      Offered: apps.filter(a => a.stage === 'Offered').length
    };

    // Metric 2: Time to hire (days from appliedAt to offer acceptance)
    let totalTTH = 0;
    let tthCount = 0;
    let excludedTTHCount = 0;

    offers.forEach(o => {
      if (o.status === 'accepted' && o.respondedAt) {
        const app = apps.find(a => a.id === o.applicationId);
        if (app && app.appliedAt) {
          const days = Math.round((new Date(o.respondedAt) - new Date(app.appliedAt)) / (1000 * 60 * 60 * 24));
          if (days >= 0) {
            totalTTH += days;
            tthCount++;
          } else {
            excludedTTHCount++;
          }
        } else {
          excludedTTHCount++;
        }
      }
    });

    const avgTimeToHireDays = tthCount > 0 ? (totalTTH / tthCount).toFixed(1) : 'N/A';

    // Metric 3: Offer Acceptance Rate
    const respondedOffers = offers.filter(o => ['accepted', 'declined'].includes(o.status));
    const acceptedCount = offers.filter(o => o.status === 'accepted').length;
    const offerAcceptanceRate = respondedOffers.length > 0 
      ? Math.round((acceptedCount / respondedOffers.length) * 100) 
      : 'N/A';

    // Metric 4: Simulated Notification Success
    const totalNotifs = notifs.length;
    const successfulNotifs = notifs.filter(n => n.status === 'sent').length;
    const notifSuccessRate = totalNotifs > 0 
      ? Math.round((successfulNotifs / totalNotifs) * 100) 
      : 'N/A';

    return {
      totalApplications: apps.length,
      activeJobs: db.jobs.filter(j => j.status === 'published').length,
      interviewsCount: db.interviews.length,
      avgTimeToHireDays,
      tthCount,
      excludedTTHCount,
      offerAcceptanceRate,
      notifSuccessRate,
      stageCounts
    };
  },

  /* ------------------------------------------------------------------
     7. Admin API
  ------------------------------------------------------------------ */
  async getUsers() {
    await delay();
    assertPermission('users.manage');
    const db = getDB();
    return db.users || [];
  },

  async updateUserRole(userId, newRole) {
    await delay();
    assertPermission('users.manage');
    const db = getDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error('User not found');

    user.role = newRole;
    saveDB(db);
    return user;
  },

  async toggleUserActive(userId, active) {
    await delay();
    const session = assertPermission('users.manage');
    const db = getDB();

    if (session.userId === userId && !active) {
      throw new Error('You cannot deactivate your own account.');
    }

    const adminCount = db.users.filter(u => u.role === ROLES.ADMIN && u.active).length;
    const target = db.users.find(u => u.id === userId);
    if (target && target.role === ROLES.ADMIN && adminCount <= 1 && !active) {
      throw new Error('Cannot deactivate the last remaining active Administrator.');
    }

    target.active = active;
    saveDB(db);
    return target;
  },

  async getNotifications() {
    await delay();
    assertPermission('notifications.view');
    const db = getDB();
    return db.notifications || [];
  },

  async retryNotification(notifId) {
    await delay();
    assertPermission('notifications.retry');
    const db = getDB();
    const notif = db.notifications.find(n => n.id === notifId);
    if (!notif) throw new Error('Notification not found');

    notif.attempts = (notif.attempts || 1) + 1;
    // Max 3 attempts, simulate success on retry
    notif.status = 'sent';
    notif.lastError = null;
    notif.sentAt = new Date().toISOString();

    saveDB(db);
    return notif;
  },

  async getActivityLog() {
    await delay();
    assertPermission('activity.view');
    const db = getDB();
    return db.activityLog.slice(-50).reverse();
  }
};

/* js/core/router-guard.js */
/**
 * HireFlow Router Guard & Navigation Controller (router-guard.js)
 * Enforces authentication and role-based page protection on load.
 * Injects user identity, active navigation states, and theme toggling.
 */


/**
 * Guard a page by checking authentication and allowed roles.
 * @param {string[]} allowedRoles Array of roles allowed on this page, e.g. ['hr'] or ['candidate']
 */
function guardPage(allowedRoles = []) {
  // Always initialize demo banner & theme toggle
  initDemoBanner();
  setupThemeToggle();
  setupSidebar();

  const session = auth.getSession();
  const currentPath = HF.location.pathname;

  // 1. Unauthenticated -> Redirect to login with ?next=
  if (!session) {
    const nextUrl = encodeURIComponent(HF.location.href);
    // Find correct relative path to login.html
    const isInSubdir = currentPath.includes('/hr/') || currentPath.includes('/candidate/') || currentPath.includes('/admin/');
    const loginTarget = isInSubdir ? '../login.html' : 'login.html';
    HF.go(`${loginTarget}?next=${nextUrl}`);
    return null;
  }

  // 2. Role Verification
  if (allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
    const isInSubdir = currentPath.includes('/hr/') || currentPath.includes('/candidate/') || currentPath.includes('/admin/');
    const forbiddenTarget = isInSubdir ? '../403.html' : '403.html';
    HF.go(forbiddenTarget);
    return null;
  }

  // 3. Populate User identity in UI
  populateUserChrome(session);

  return session;
}

/**
 * Injects user info into topbar & sidebar
 * @param {Object} session 
 */
function populateUserChrome(session) {
  // User name
  document.querySelectorAll('[data-user-name]').forEach(el => {
    el.textContent = session.name;
  });

  // User role
  document.querySelectorAll('[data-user-role]').forEach(el => {
    el.textContent = session.role.toUpperCase();
  });

  // User avatar container
  document.querySelectorAll('[data-user-avatar]').forEach(el => {
    el.innerHTML = renderAvatar(session.name, 'sm');
  });

  // Logout triggers
  document.querySelectorAll('[data-action="logout"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      auth.logout();
      const currentPath = HF.location.pathname;
      const isInSubdir = currentPath.includes('/hr/') || currentPath.includes('/candidate/') || currentPath.includes('/admin/');
      HF.go(isInSubdir ? '../login.html' : 'login.html');
    });
  });

  // Mark active navigation link
  const currentFile = HF.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-link, .nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href === currentFile || href.endsWith(`/${currentFile}`))) {
      link.classList.add('active');
    }
  });
}

/* js/pages/index.page.js */
;(() => {
/**
 * HireFlow Landing & Job Search Page Controller (index.page.js)
 */


const ITEMS_PER_PAGE = 9;
let allJobs = [];
let currentPage = 1;

// Initialize
HF.onReady('/index.html', async () => {
  initDemoBanner();
  setupThemeToggle();
  checkAuthNav();
  initFilterBindings();
  readFiltersFromURL();
  await loadJobs();
});

function checkAuthNav() {
  const session = auth.getSession();
  const navContainer = document.getElementById('auth-nav-buttons');
  if (session && navContainer) {
    const dashboardLink = session.role === 'admin' 
      ? 'admin/overview.html' 
      : (session.role === 'hr' ? 'hr/dashboard.html' : 'candidate/dashboard.html');
    
    navContainer.innerHTML = `
      <a href="${dashboardLink}" class="btn btn-primary btn-sm">Go to Dashboard</a>
    `;
  }
}

function initFilterBindings() {
  const heroForm = document.getElementById('hero-search-form');
  const sortSelect = document.getElementById('sort-select');
  const depSelect = document.getElementById('filter-department');
  const typeSelect = document.getElementById('filter-type');
  const expSelect = document.getElementById('filter-experience');
  const salarySlider = document.getElementById('filter-salary');
  const salaryDisplay = document.getElementById('salary-val-display');
  const clearBtn = document.getElementById('btn-clear-filters');

  salarySlider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    salaryDisplay.textContent = val > 0 ? `$${val.toLocaleString()}+` : '$0';
  });

  const triggerSearch = () => {
    currentPage = 1;
    updateURL();
    renderJobList();
  };

  heroForm.addEventListener('submit', (e) => {
    e.preventDefault();
    triggerSearch();
    document.getElementById('jobs').scrollIntoView({ behavior: 'smooth' });
  });

  sortSelect.addEventListener('change', triggerSearch);
  depSelect.addEventListener('change', triggerSearch);
  typeSelect.addEventListener('change', triggerSearch);
  expSelect.addEventListener('change', triggerSearch);
  salarySlider.addEventListener('change', triggerSearch);

  clearBtn.addEventListener('click', () => {
    document.getElementById('hero-keywords').value = '';
    document.getElementById('hero-location').value = '';
    depSelect.value = '';
    typeSelect.value = '';
    expSelect.value = '';
    salarySlider.value = 0;
    salaryDisplay.textContent = '$0';
    sortSelect.value = 'newest';
    triggerSearch();
  });
}

function readFiltersFromURL() {
  const params = new URLSearchParams(HF.location.search);
  if (params.has('q')) document.getElementById('hero-keywords').value = params.get('q');
  if (params.has('loc')) document.getElementById('hero-location').value = params.get('loc');
  if (params.has('dept')) document.getElementById('filter-department').value = params.get('dept');
  if (params.has('type')) document.getElementById('filter-type').value = params.get('type');
  if (params.has('exp')) document.getElementById('filter-experience').value = params.get('exp');
  if (params.has('sort')) document.getElementById('sort-select').value = params.get('sort');
  if (params.has('salary')) {
    const sVal = params.get('salary');
    document.getElementById('filter-salary').value = sVal;
    document.getElementById('salary-val-display').textContent = Number(sVal) > 0 ? `$${Number(sVal).toLocaleString()}+` : '$0';
  }
  if (params.has('page')) currentPage = Math.max(1, parseInt(params.get('page'), 10) || 1);
}

function updateURL() {
  const params = new URLSearchParams();
  const q = document.getElementById('hero-keywords').value.trim();
  const loc = document.getElementById('hero-location').value.trim();
  const dept = document.getElementById('filter-department').value;
  const type = document.getElementById('filter-type').value;
  const exp = document.getElementById('filter-experience').value;
  const salary = document.getElementById('filter-salary').value;
  const sort = document.getElementById('sort-select').value;

  if (q) params.set('q', q);
  if (loc) params.set('loc', loc);
  if (dept) params.set('dept', dept);
  if (type) params.set('type', type);
  if (exp) params.set('exp', exp);
  if (Number(salary) > 0) params.set('salary', salary);
  if (sort && sort !== 'newest') params.set('sort', sort);
  if (currentPage > 1) params.set('page', currentPage);

  const newUrl = `${HF.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
  HF.replace(newUrl);
}

async function loadJobs() {
  const container = document.getElementById('job-cards-list');
  renderSkeleton(container, 'card', 6);

  try {
    allJobs = await api.getJobs();
    document.getElementById('stat-open-jobs').textContent = `${allJobs.length}+`;
    renderJobList();
  } catch (err) {
    container.innerHTML = `<div class="error-state"><p>${escapeHTML(err.message)}</p></div>`;
  }
}

function getFilteredJobs() {
  const q = document.getElementById('hero-keywords').value.trim().toLowerCase();
  const loc = document.getElementById('hero-location').value.trim().toLowerCase();
  const dept = document.getElementById('filter-department').value;
  const type = document.getElementById('filter-type').value;
  const exp = document.getElementById('filter-experience').value;
  const salary = Number(document.getElementById('filter-salary').value);
  const sortBy = document.getElementById('sort-select').value;

  let list = allJobs.filter(job => {
    if (q) {
      const matchTitle = job.title.toLowerCase().includes(q);
      const matchDesc = job.description.toLowerCase().includes(q);
      const matchSkills = job.skills.some(s => s.toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchSkills) return false;
    }
    if (loc && !job.location.toLowerCase().includes(loc)) return false;
    if (dept && job.department !== dept) return false;
    if (type && job.type !== type) return false;
    if (exp && job.experience !== exp) return false;
    if (salary > 0 && job.salaryMax < salary) return false;
    return true;
  });

  if (sortBy === 'salary') {
    list.sort((a, b) => b.salaryMax - a.salaryMax);
  } else {
    list.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  }

  return list;
}

function renderJobList() {
  const container = document.getElementById('job-cards-list');
  const countText = document.getElementById('results-count-text');
  const pagination = document.getElementById('jobs-pagination');

  const filtered = getFilteredJobs();
  countText.textContent = `Showing ${filtered.length} open position${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    renderEmpty(
      container,
      'No jobs match your filters',
      'Try broadening your search keywords, location or salary preferences.',
      `<button type="button" class="btn btn-secondary btn-sm" id="btn-empty-clear">Clear all filters</button>`
    );
    const emptyClear = document.getElementById('btn-empty-clear');
    if (emptyClear) {
      emptyClear.onclick = () => document.getElementById('btn-clear-filters').click();
    }
    pagination.innerHTML = '';
    return;
  }

  // Pagination calculation
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageJobs = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  container.innerHTML = pageJobs.map(job => `
    <a href="job-details.html?id=${encodeURIComponent(job.id)}" class="job-card" aria-label="View job: ${escapeHTML(job.title)}">
      <div class="flex justify-between items-center" style="gap: var(--space-2); flex-wrap: wrap;">
        <h3 class="job-card-title">${escapeHTML(job.title)}</h3>
        <span class="job-card-salary">$${job.salaryMin.toLocaleString()} - $${job.salaryMax.toLocaleString()} / yr</span>
      </div>
      <div class="job-card-meta">
        <span class="job-card-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
          ${escapeHTML(job.department)}
        </span>
        <span class="job-card-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          ${escapeHTML(job.location)}
        </span>
        <span class="job-card-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          ${escapeHTML(job.type)} • ${escapeHTML(job.experience)} yrs exp
        </span>
        <span class="job-card-meta-item" style="margin-left: auto;">
          Posted ${relativeTime(job.postedAt)}
        </span>
      </div>
      <p class="text-sm text-muted" style="margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
        ${escapeHTML(job.description)}
      </p>
      <div class="flex gap-2" style="flex-wrap: wrap; margin-top: var(--space-2);">
        ${job.skills.slice(0, 4).map(skill => `<span class="badge badge-default">${escapeHTML(skill)}</span>`).join('')}
        ${job.skills.length > 4 ? `<span class="badge badge-default">+${job.skills.length - 4} more</span>` : ''}
      </div>
    </a>
  `).join('');

  // Render pagination controls
  renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
  const pagination = document.getElementById('jobs-pagination');
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  let html = '';
  html += `
    <button type="button" class="page-btn" id="page-prev" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous Page">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    html += `
      <button type="button" class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}" aria-label="Page ${i}" ${i === currentPage ? 'aria-current="page"' : ''}>
        ${i}
      </button>
    `;
  }

  html += `
    <button type="button" class="page-btn" id="page-next" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Next Page">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
  `;

  pagination.innerHTML = html;

  const prevBtn = pagination.querySelector('#page-prev');
  const nextBtn = pagination.querySelector('#page-next');
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        updateURL();
        renderJobList();
        document.getElementById('jobs').scrollIntoView({ behavior: 'smooth' });
      }
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (currentPage < totalPages) {
        currentPage++;
        updateURL();
        renderJobList();
        document.getElementById('jobs').scrollIntoView({ behavior: 'smooth' });
      }
    };
  }

  pagination.querySelectorAll('[data-page]').forEach(btn => {
    btn.onclick = () => {
      currentPage = Number(btn.getAttribute('data-page'));
      updateURL();
      renderJobList();
      document.getElementById('jobs').scrollIntoView({ behavior: 'smooth' });
    };
  });
}

})();

/* js/pages/job-details.page.js */
;(() => {
/**
 * HireFlow Job Details & Candidate Application Page (job-details.page.js)
 */


let currentJob = null;
let currentCandidate = null;
let uploadedFileMeta = null;

HF.onReady('/job-details.html', async () => {
  initDemoBanner();
  setupThemeToggle();

  const urlParams = new URLSearchParams(HF.location.search);
  const jobId = urlParams.get('id');

  if (!jobId) {
    HF.go('index.html');
    return;
  }

  await loadJobDetails(jobId);
});

async function loadJobDetails(jobId) {
  const container = document.getElementById('job-details-container');
  try {
    currentJob = await api.getJobById(jobId);
    document.title = `${currentJob.title} | HireFlow`;
    document.getElementById('breadcrumb-title').textContent = currentJob.title;

    const session = auth.getSession();
    if (session && session.role === 'candidate') {
      try {
        currentCandidate = await api.getCandidateProfile(session.userId);
      } catch (e) {
        console.warn('Could not load candidate profile', e);
      }
    }

    renderJobView();
    loadSimilarJobs();
  } catch (err) {
    renderError(container, `Could not load job details: ${err.message}`, () => loadJobDetails(jobId));
  }
}

async function renderJobView() {
  const container = document.getElementById('job-details-container');
  const session = auth.getSession();

  // Check if candidate has already applied
  let hasApplied = false;
  if (session && session.role === 'candidate') {
    const apps = await api.getApplications({ jobId: currentJob.id });
    hasApplied = apps.length > 0;
  }

  const isClosed = currentJob.status !== 'published' || (currentJob.closesAt && new Date(currentJob.closesAt) < new Date());

  const leftColumnHtml = `
    <div class="card">
      <div style="border-bottom: 1px solid var(--border); padding-bottom: var(--space-6); margin-bottom: var(--space-6);">
        <h1 style="font-size: var(--font-size-2xl); margin-bottom: var(--space-3);">${escapeHTML(currentJob.title)}</h1>
        <div class="job-card-meta" style="font-size: var(--font-size-sm); margin-bottom: var(--space-4);">
          <span class="job-card-meta-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
            <strong>${escapeHTML(currentJob.department)}</strong>
          </span>
          <span class="job-card-meta-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            ${escapeHTML(currentJob.location)}
          </span>
          <span class="job-card-meta-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${escapeHTML(currentJob.type)} • ${escapeHTML(currentJob.experience)} yrs experience
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge badge-success" style="font-size: var(--font-size-sm); padding: 6px 12px;">
            $${currentJob.salaryMin.toLocaleString()} - $${currentJob.salaryMax.toLocaleString()} USD / year
          </span>
          <span class="text-xs text-muted" style="margin-left: auto;">Posted ${relativeTime(currentJob.postedAt)}</span>
        </div>
      </div>

      <section style="margin-bottom: var(--space-6);">
        <h2 style="font-size: var(--font-size-md); margin-bottom: var(--space-3);">About the Role</h2>
        <p class="lead" style="white-space: pre-line;">${escapeHTML(currentJob.description)}</p>
      </section>

      <section style="margin-bottom: var(--space-6);">
        <h2 style="font-size: var(--font-size-md); margin-bottom: var(--space-3);">Key Requirements</h2>
        <ul style="padding-left: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); color: var(--text);">
          ${currentJob.requirements.map(req => `<li>${escapeHTML(req)}</li>`).join('')}
        </ul>
      </section>

      <section>
        <h2 style="font-size: var(--font-size-md); margin-bottom: var(--space-3);">Required Skills</h2>
        <div class="flex gap-2" style="flex-wrap: wrap;">
          ${currentJob.skills.map(s => `<span class="badge badge-primary" style="font-size: 13px;">${escapeHTML(s)}</span>`).join('')}
        </div>
      </section>
    </div>
  `;

  let rightColumnHtml = '';

  if (isClosed) {
    rightColumnHtml = `
      <div class="card apply-card">
        <h3 class="card-title" style="color: var(--danger); margin-bottom: var(--space-2);">Applications Closed</h3>
        <p class="text-sm text-muted">This opening is no longer accepting new candidate applications.</p>
        <a href="index.html#jobs" class="btn btn-secondary w-full" style="margin-top: var(--space-4);">Explore Other Jobs</a>
      </div>
    `;
  } else if (!session) {
    const nextUrl = encodeURIComponent(HF.location.href);
    rightColumnHtml = `
      <div class="card apply-card text-center" style="padding: var(--space-8) var(--space-6);">
        <h3 style="font-size: var(--font-size-lg); margin-bottom: var(--space-2);">Ready to Apply?</h3>
        <p class="text-sm text-muted" style="margin-bottom: var(--space-6);">Create an account or sign in to submit your resume in under 2 minutes.</p>
        <a href="login.html?next=${nextUrl}" class="btn btn-primary btn-lg w-full" style="margin-bottom: var(--space-3);">Sign In to Apply</a>
        <a href="register.html" class="btn btn-secondary w-full">Create Candidate Account</a>
      </div>
    `;
  } else if (session.role === 'candidate') {
    if (hasApplied) {
      rightColumnHtml = `
        <div class="card apply-card text-center" style="padding: var(--space-8) var(--space-6);">
          <div style="width: 48px; height: 48px; background: var(--success-soft); color: var(--success); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-3);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <h3 style="font-size: var(--font-size-md); margin-bottom: var(--space-2);">Application Submitted</h3>
          <p class="text-sm text-muted" style="margin-bottom: var(--space-6);">You have already applied for this opening. You can track your stage and timeline in your candidate dashboard.</p>
          <a href="candidate/dashboard.html" class="btn btn-primary w-full">View in Candidate Portal</a>
        </div>
      `;
    } else {
      // Application Form
      rightColumnHtml = `
        <div class="card apply-card">
          <h2 class="card-title" style="margin-bottom: var(--space-4);">Apply for Position</h2>
          <form id="apply-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="cand-name">Full Name <span class="required-indicator">*</span></label>
              <input type="text" id="cand-name" class="form-control" value="${escapeHTML(currentCandidate ? currentCandidate.name : session.name)}" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="cand-email">Email Address <span class="required-indicator">*</span></label>
              <input type="email" id="cand-email" class="form-control" value="${escapeHTML(currentCandidate ? currentCandidate.email : session.email)}" required readonly>
            </div>

            <div class="form-group">
              <label class="form-label" for="cand-phone">Phone Number <span class="required-indicator">*</span></label>
              <input type="tel" id="cand-phone" class="form-control" value="${escapeHTML(currentCandidate ? currentCandidate.phone : '')}" placeholder="+1 (555) 010-0000" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="cand-note">
                Cover Note
                <span id="note-char-count" class="char-counter">0 / 1000</span>
              </label>
              <textarea id="cand-note" class="form-control" maxlength="1000" placeholder="Briefly describe what makes you a great fit for this position..."></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">Resume (PDF or DOCX, max 2MB) <span class="required-indicator">*</span></label>
              <div class="file-dropzone" id="resume-dropzone">
                <svg class="file-dropzone-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <div class="text-sm font-semibold">Click to upload or drag & drop</div>
                <div class="text-xs text-muted" id="dropzone-text">PDF or DOCX files up to 2MB</div>
                <input type="file" id="resume-file-input" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
              </div>
              <div id="file-error" class="form-error" style="margin-top: 4px;"></div>
            </div>

            <label class="form-check" style="margin-top: var(--space-4);">
              <input type="checkbox" id="consent-check" class="form-check-input" required>
              <span class="form-check-label text-xs text-muted">
                I confirm that the submitted information is accurate and consent to processing my simulated demo application.
              </span>
            </label>

            <button type="submit" id="btn-submit-app" class="btn btn-primary btn-lg w-full" style="margin-top: var(--space-4);">
              Submit Application
            </button>
          </form>
        </div>
      `;
    }
  } else {
    // HR / Admin Viewing
    rightColumnHtml = `
      <div class="card apply-card">
        <span class="badge badge-primary" style="margin-bottom: var(--space-3);">Staff Preview</span>
        <h3 class="card-title" style="margin-bottom: var(--space-2);">Managing this Position</h3>
        <p class="text-sm text-muted" style="margin-bottom: var(--space-4);">You are logged in as <strong>${escapeHTML(session.role.toUpperCase())}</strong>.</p>
        <a href="hr/pipeline.html?jobId=${encodeURIComponent(currentJob.id)}" class="btn btn-primary w-full" style="margin-bottom: var(--space-2);">View Pipeline Kanban</a>
        <a href="hr/jobs.html" class="btn btn-secondary w-full">Edit Job in Jobs Directory</a>
      </div>
    `;
  }

  container.innerHTML = leftColumnHtml + rightColumnHtml;

  // Bind Form handlers if rendered
  bindApplicationForm();
}

function bindApplicationForm() {
  const form = document.getElementById('apply-form');
  if (!form) return;

  const noteInput = document.getElementById('cand-note');
  const counter = document.getElementById('note-char-count');
  const dropzone = document.getElementById('resume-dropzone');
  const fileInput = document.getElementById('resume-file-input');
  const fileError = document.getElementById('file-error');
  const dropzoneText = document.getElementById('dropzone-text');

  // Pre-fill profile resume if available
  if (currentCandidate && currentCandidate.resumeMeta) {
    uploadedFileMeta = currentCandidate.resumeMeta;
    dropzoneText.innerHTML = `Using saved profile resume: <strong>${escapeHTML(uploadedFileMeta.fileName)}</strong>`;
  }

  noteInput.addEventListener('input', () => {
    counter.textContent = `${noteInput.value.length} / 1000`;
  });

  dropzone.onclick = () => fileInput.click();

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  };

  dropzone.ondragleave = () => dropzone.classList.remove('dragover');

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  fileInput.onchange = () => {
    if (fileInput.files.length > 0) {
      handleFileSelected(fileInput.files[0]);
    }
  };

  function handleFileSelected(file) {
    fileError.textContent = '';
    const name = file.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      fileError.textContent = 'Only PDF and DOCX documents are accepted.';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      fileError.textContent = 'File size exceeds maximum 2 MB limit.';
      return;
    }

    uploadedFileMeta = {
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/pdf',
      uploadedAt: new Date().toISOString()
    };

    dropzoneText.innerHTML = `<span style="color: var(--success); font-weight: 600;">Selected: ${escapeHTML(file.name)} (${(file.size / 1024).toFixed(0)} KB)</span>`;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();

    const name = document.getElementById('cand-name').value.trim();
    const phone = document.getElementById('cand-phone').value.trim();
    const consent = document.getElementById('consent-check').checked;
    const note = noteInput.value.trim();
    const submitBtn = document.getElementById('btn-submit-app');

    if (!name) {
      showToast('Please enter your full name', 'error');
      return;
    }
    if (!phone) {
      showToast('Please enter your phone number', 'error');
      return;
    }
    if (!uploadedFileMeta) {
      fileError.textContent = 'Please attach your resume file (PDF or DOCX)';
      showToast('Please attach your resume file', 'error');
      return;
    }
    if (!consent) {
      showToast('Please accept the accuracy and consent agreement', 'warning');
      return;
    }

    setLoading(submitBtn, true);

    try {
      await api.applyForJob({
        jobId: currentJob.id,
        coverNote: note,
        resumeMeta: uploadedFileMeta
      });

      showToast('Application successfully submitted!', 'success');
      renderJobView();
    } catch (err) {
      showToast(err.message, 'error');
      setLoading(submitBtn, false);
    }
  };
}

async function loadSimilarJobs() {
  const container = document.getElementById('similar-jobs-list');
  try {
    const all = await api.getJobs();
    const similar = all.filter(j => j.id !== currentJob.id && (j.department === currentJob.department || j.type === currentJob.type)).slice(0, 3);

    if (similar.length === 0) {
      container.parentElement.style.display = 'none';
      return;
    }

    container.innerHTML = similar.map(j => `
      <a href="job-details.html?id=${encodeURIComponent(j.id)}" class="job-card" style="padding: var(--space-4);">
        <h4 style="font-size: var(--font-size-base);">${escapeHTML(j.title)}</h4>
        <div class="text-xs text-muted" style="margin-bottom: var(--space-2);">${escapeHTML(j.department)} • ${escapeHTML(j.location)}</div>
        <div class="job-card-salary" style="font-size: 13px;">$${j.salaryMin.toLocaleString()} - $${j.salaryMax.toLocaleString()}</div>
      </a>
    `).join('');
  } catch (e) {
    container.parentElement.style.display = 'none';
  }
}

})();

/* js/pages/login.page.js */
;(() => {
/**
 * HireFlow Login Page Controller (login.page.js)
 */


HF.onReady('/login.html', () => {
  initDemoBanner();
  setupThemeToggle();

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const togglePwdBtn = document.getElementById('btn-toggle-pwd');
  const rememberCheck = document.getElementById('remember-me');
  const submitBtn = document.getElementById('btn-submit-login');
  const capsWarning = document.getElementById('caps-lock-warning');
  const lockoutAlert = document.getElementById('lockout-alert');
  const lockoutText = document.getElementById('lockout-text');

  // Check initial lockout
  checkLockoutState();

  function checkLockoutState() {
    const lock = auth.getLockoutStatus();
    if (lock.isLocked) {
      lockoutAlert.style.display = 'block';
      lockoutText.textContent = `Too many failed login attempts. Temporarily locked for security. Please wait ${lock.remainingSeconds}s.`;
      submitBtn.disabled = true;

      const interval = setInterval(() => {
        const currentLock = auth.getLockoutStatus();
        if (currentLock.isLocked) {
          lockoutText.textContent = `Too many failed login attempts. Temporarily locked for security. Please wait ${currentLock.remainingSeconds}s.`;
        } else {
          clearInterval(interval);
          lockoutAlert.style.display = 'none';
          submitBtn.disabled = false;
        }
      }, 1000);
    } else {
      lockoutAlert.style.display = 'none';
      submitBtn.disabled = false;
    }
  }

  // Password show/hide
  togglePwdBtn.addEventListener('click', () => {
    const isPwd = passwordInput.type === 'password';
    passwordInput.type = isPwd ? 'text' : 'password';
    togglePwdBtn.setAttribute('aria-label', isPwd ? 'Hide password' : 'Show password');
  });

  // Caps lock warning
  passwordInput.addEventListener('keyup', (e) => {
    if (e.getModifierState && e.getModifierState('CapsLock')) {
      capsWarning.style.display = 'flex';
    } else {
      capsWarning.style.display = 'none';
    }
  });

  // Demo chips click-to-fill
  document.querySelectorAll('[data-fill-email]').forEach(chip => {
    chip.addEventListener('click', () => {
      emailInput.value = chip.getAttribute('data-fill-email');
      passwordInput.value = chip.getAttribute('data-fill-pass');
      emailInput.dispatchEvent(new Event('input'));
      passwordInput.dispatchEvent(new Event('input'));
      submitBtn.focus();
    });
  });

  // Validation Schema
  const schema = {
    'login-email': [rules.required, rules.email],
    'login-password': [rules.required]
  };

  setupFormValidation(form, schema, async (data) => {
    setLoading(submitBtn, true);

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const rememberMe = rememberCheck.checked;

    const result = await auth.login(email, password, rememberMe);
    setLoading(submitBtn, false);

    if (!result.success) {
      showToast(result.error, 'error');
      checkLockoutState();
      return;
    }

    showToast('Signed in successfully! Redirecting...', 'success', 2000);

    // Redirect to next URL or role home
    const params = new URLSearchParams(HF.location.search);
    const nextUrl = params.get('next');

    setTimeout(() => {
      if (nextUrl && !nextUrl.includes('login.html')) {
        HF.go(decodeURIComponent(nextUrl));
      } else {
        const role = result.user.role;
        if (role === 'admin') {
          HF.go('admin/overview.html');
        } else if (role === 'hr') {
          HF.go('hr/dashboard.html');
        } else {
          HF.go('candidate/dashboard.html');
        }
      }
    }, 400);
  });
});

})();

/* js/pages/register.page.js */
;(() => {
/**
 * HireFlow Candidate Registration Controller (register.page.js)
 */


HF.onReady('/register.html', () => {
  initDemoBanner();
  setupThemeToggle();

  const form = document.getElementById('register-form');
  const nameInput = document.getElementById('reg-name');
  const emailInput = document.getElementById('reg-email');
  const phoneInput = document.getElementById('reg-phone');
  const passwordInput = document.getElementById('reg-password');
  const confirmPwdInput = document.getElementById('reg-confirm-password');
  const togglePwdBtn = document.getElementById('btn-toggle-reg-pwd');
  const strengthBar = document.getElementById('pwd-strength-bar');
  const strengthText = document.getElementById('pwd-strength-text');
  const submitBtn = document.getElementById('btn-submit-reg');

  // Toggle password visibility
  togglePwdBtn.addEventListener('click', () => {
    const isPwd = passwordInput.type === 'password';
    passwordInput.type = isPwd ? 'text' : 'password';
  });

  // Password live strength calculation
  passwordInput.addEventListener('input', () => {
    const val = passwordInput.value;
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    strengthBar.className = 'password-strength-bar';
    if (val.length === 0) {
      strengthBar.style.width = '0';
      strengthText.textContent = 'Strength: Enter password';
    } else if (score <= 1) {
      strengthBar.classList.add('weak');
      strengthText.textContent = 'Strength: Weak (Needs 8+ chars, upper & lower letters)';
    } else if (score <= 3) {
      strengthBar.classList.add('medium');
      strengthText.textContent = 'Strength: Medium (Add numbers & special symbols)';
    } else {
      strengthBar.classList.add('strong');
      strengthText.textContent = 'Strength: Strong!';
    }
  });

  // Validation Schema
  const schema = {
    'reg-name': [rules.required, rules.minLength(2)],
    'reg-email': [rules.required, rules.email],
    'reg-phone': [rules.required, rules.phone],
    'reg-password': [rules.required, rules.minLength(6)],
    'reg-confirm-password': [
      rules.required,
      rules.matches(() => passwordInput.value, 'password')
    ],
    'reg-terms': [rules.required]
  };

  setupFormValidation(form, schema, async (data) => {
    setLoading(submitBtn, true);

    const db = storage.get(DB_KEY);
    if (!db) {
      showToast('Database not found. Refreshing...', 'error');
      setLoading(submitBtn, false);
      return;
    }

    const email = emailInput.value.trim().toLowerCase();
    const existing = db.users.find(u => u.email.toLowerCase() === email);
    if (existing) {
      showToast('An account with this email already exists. Please sign in.', 'error');
      setLoading(submitBtn, false);
      return;
    }

    const newUserId = `usr_cand_${Date.now()}`;
    const now = new Date().toISOString();

    // 1. Create User
    const newUser = {
      id: newUserId,
      name: nameInput.value.trim(),
      email,
      passwordHash: mockHash(passwordInput.value),
      role: 'candidate',
      companyId: null,
      active: true,
      createdAt: now,
      lastLoginAt: now
    };
    db.users.push(newUser);

    // 2. Create Candidate Profile
    const newProfile = {
      userId: newUserId,
      phone: phoneInput.value.trim(),
      location: 'Remote',
      headline: 'Candidate',
      skills: [],
      experienceYears: 0,
      education: '',
      linkedin: '',
      resumeMeta: null
    };
    db.candidateProfiles.push(newProfile);

    storage.set(DB_KEY, db);

    // Log the user in
    await auth.login(email, passwordInput.value, true);

    showToast('Candidate account created successfully!', 'success');

    setTimeout(() => {
      HF.go('candidate/dashboard.html');
    }, 400);
  });
});

})();

/* js/pages/candidate-dashboard.page.js */
;(() => {
/**
 * HireFlow Candidate Dashboard Controller (candidate-dashboard.page.js)
 */


let session = null;

HF.onReady('/candidate/dashboard.html', async () => {
  session = guardPage(['candidate']);
  if (!session) return;

  await Promise.all([
    loadProfileProgress(),
    loadApplicationsAndOffers(),
    loadUpcomingInterviews(),
    loadRecommendedJobs()
  ]);
});

async function loadProfileProgress() {
  try {
    const profile = await api.getCandidateProfile(session.userId);
    const fields = [
      Boolean(profile.phone),
      Boolean(profile.location),
      Boolean(profile.headline),
      Boolean(profile.skills && profile.skills.length > 0),
      Boolean(profile.education),
      Boolean(profile.linkedin),
      Boolean(profile.resumeMeta)
    ];

    const filled = fields.filter(Boolean).length;
    const pct = Math.round((filled / fields.length) * 100);

    const circle = document.getElementById('profile-ring-circle');
    const pctText = document.getElementById('profile-ring-pct');
    const label = document.getElementById('profile-strength-label');

    const circumference = 2 * Math.PI * 38; // ~238.76
    const offset = circumference - (pct / 100) * circumference;

    if (circle) circle.style.strokeDashoffset = offset;
    if (pctText) pctText.textContent = `${pct}%`;

    if (label) {
      if (pct === 100) label.textContent = 'All Stars (100%)';
      else if (pct >= 70) label.textContent = 'Strong Profile';
      else if (pct >= 40) label.textContent = 'Good Start';
      else label.textContent = 'Needs Attention';
    }
  } catch (e) {
    console.error('Error loading profile progress:', e);
  }
}

async function loadApplicationsAndOffers() {
  const container = document.getElementById('active-applications-list');
  renderSkeleton(container, 'card', 2);

  try {
    const apps = await api.getApplications();
    const offers = await api.getOffers();

    // Update Sidebar & KPI counts
    const activeApps = apps.filter(a => !['Rejected', 'Withdrawn'].includes(a.stage));
    document.getElementById('kpi-active-apps').textContent = activeApps.length;
    document.getElementById('sidebar-app-count').textContent = apps.length;
    document.getElementById('kpi-offers-count').textContent = offers.length;

    // Check for Pending Offer (status === 'issued')
    const pendingOffer = offers.find(o => o.status === 'issued');
    const offerAlert = document.getElementById('pending-offer-alert');
    if (pendingOffer && offerAlert) {
      offerAlert.style.display = 'block';
      offerAlert.innerHTML = `
        <div class="card" style="border-left: 4px solid var(--warning); background: var(--surface);">
          <div class="flex justify-between items-center" style="flex-wrap: wrap; gap: var(--space-3);">
            <div>
              <span class="badge badge-warning" style="margin-bottom: var(--space-2);">Action Required: Job Offer Received</span>
              <h3 style="font-size: var(--font-size-md); margin-bottom: 2px;">
                Congratulations! You have received an official offer for <strong>${escapeHTML(pendingOffer.jobTitle)}</strong>
              </h3>
              <p class="text-sm text-muted" style="margin: 0;">
                Salary: <strong>$${pendingOffer.salary.toLocaleString()} USD</strong> • Target Start Date: <strong>${formatDate(pendingOffer.startDate)}</strong>
              </p>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-decline-offer">Decline</button>
              <button type="button" class="btn btn-success btn-sm" id="btn-accept-offer">Accept Offer</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('btn-accept-offer').onclick = async () => {
        const confirmed = await confirmDialog({
          title: 'Accept Job Offer',
          message: `Are you sure you want to accept the offer for ${pendingOffer.jobTitle}? This will confirm your start date and launch your onboarding checklist.`,
          confirmText: 'Yes, Accept Offer'
        });
        if (confirmed) {
          await api.respondToOffer(pendingOffer.id, 'accepted');
          showToast('Offer successfully accepted! Welcome to the team!', 'success');
          loadApplicationsAndOffers();
        }
      };

      document.getElementById('btn-decline-offer').onclick = async () => {
        const confirmed = await confirmDialog({
          title: 'Decline Job Offer',
          message: `Are you sure you want to decline this offer for ${pendingOffer.jobTitle}?`,
          confirmText: 'Decline Offer',
          danger: true
        });
        if (confirmed) {
          await api.respondToOffer(pendingOffer.id, 'declined');
          showToast('Offer declined.', 'info');
          loadApplicationsAndOffers();
        }
      };
    } else if (offerAlert) {
      offerAlert.style.display = 'none';
    }

    // Render Active Applications Cards
    if (activeApps.length === 0) {
      renderEmpty(
        container,
        'No active applications',
        'You do not have any active applications in progress.',
        `<a href="../index.html#jobs" class="btn btn-primary btn-sm">Explore Open Positions</a>`
      );
      return;
    }

    const stages = ['Applied', 'Screening', 'Interview', 'Selected', 'Offered'];

    container.innerHTML = activeApps.map(app => {
      const currentStageIndex = stages.indexOf(app.stage);

      return `
        <div class="card">
          <div class="flex justify-between items-center" style="margin-bottom: var(--space-2); flex-wrap: wrap;">
            <div>
              <h3 style="font-size: var(--font-size-md); margin-bottom: 2px;">${escapeHTML(app.jobTitle)}</h3>
              <span class="text-xs text-muted">Applied ${formatDate(app.appliedAt)} (${relativeTime(app.appliedAt)})</span>
            </div>
            <span class="badge badge-stage-${app.stage.toLowerCase()}">${escapeHTML(app.stage)}</span>
          </div>

          <!-- Horizontal Stage Timeline -->
          <div class="stage-stepper" aria-label="Application progress stepper">
            ${stages.map((st, i) => {
              let nodeClass = '';
              if (currentStageIndex > i) nodeClass = 'completed';
              else if (currentStageIndex === i) nodeClass = 'current';

              return `
                <div class="step-node ${nodeClass}">
                  <div class="step-dot">${i + 1}</div>
                  <div class="step-label">${st}</div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="flex justify-between items-center" style="border-top: 1px solid var(--border); padding-top: var(--space-3); margin-top: var(--space-2);">
            <span class="text-xs text-muted">Updated ${relativeTime(app.updatedAt)}</span>
            <div class="flex gap-2">
              <a href="applications.html" class="btn btn-secondary btn-sm">View Timeline Details</a>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="error-state"><p>${escapeHTML(err.message)}</p></div>`;
  }
}

async function loadUpcomingInterviews() {
  const container = document.getElementById('upcoming-interviews-list');
  try {
    const list = await api.getInterviews();
    const now = new Date().getTime();
    const upcoming = list.filter(i => new Date(i.startsAt).getTime() >= now && i.status !== 'cancelled');

    document.getElementById('kpi-upcoming-interviews').textContent = upcoming.length;
    document.getElementById('sidebar-interview-count').textContent = upcoming.length;

    if (upcoming.length === 0) {
      renderEmpty(container, 'No upcoming interviews scheduled', 'When a recruiter schedules an interview, it will appear here.');
      return;
    }

    container.innerHTML = `
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
        ${upcoming.map(item => `
          <div class="card" style="padding: var(--space-4);">
            <div class="flex justify-between items-center" style="margin-bottom: var(--space-2);">
              <span class="badge badge-primary">${escapeHTML(item.mode)}</span>
              <span class="text-xs text-muted font-semibold">${item.durationMin} mins</span>
            </div>
            <h4 style="font-size: var(--font-size-sm); margin-bottom: 4px;">${escapeHTML(item.title)}</h4>
            <div class="text-xs text-muted" style="margin-bottom: var(--space-3);">
              📅 ${formatDate(item.startsAt)} at ${formatTime(item.startsAt)}
            </div>
            <div class="flex gap-2">
              ${item.location && item.location.startsWith('http') 
                ? `<a href="${escapeHTML(item.location)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Join Video Meeting</a>`
                : `<span class="text-xs text-muted">Location: ${escapeHTML(item.location || 'Online')}</span>`}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="text-muted text-sm">Could not load interviews.</p>`;
  }
}

async function loadRecommendedJobs() {
  const container = document.getElementById('recommended-jobs-list');
  try {
    const jobs = await api.getJobs();
    const recommended = jobs.slice(0, 3);

    container.innerHTML = recommended.map(j => `
      <a href="../job-details.html?id=${encodeURIComponent(j.id)}" class="job-card" style="padding: var(--space-4);">
        <h3 class="job-card-title" style="font-size: var(--font-size-base);">${escapeHTML(j.title)}</h3>
        <div class="text-xs text-muted" style="margin-bottom: var(--space-2);">${escapeHTML(j.department)} • ${escapeHTML(j.location)}</div>
        <div class="job-card-salary" style="font-size: 13px;">$${j.salaryMin.toLocaleString()} - $${j.salaryMax.toLocaleString()}</div>
      </a>
    `).join('');
  } catch (e) {
    container.innerHTML = '';
  }
}

})();

/* js/pages/candidate-profile.page.js */
;(() => {
/**
 * HireFlow Candidate Profile Controller (candidate-profile.page.js)
 */


let session = null;
let profileData = null;
let skills = [];
let resumeMeta = null;
let isDirty = false;

HF.onReady('/candidate/profile.html', async () => {
  session = guardPage(['candidate']);
  if (!session) return;

  setupTabs();
  setupSkillsTagInput();
  setupResumeDropzone();
  setupUnsavedWarning();
  await loadProfile();
});

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetPanel = document.getElementById(btn.getAttribute('data-tab'));
      if (targetPanel) targetPanel.classList.add('active');
    });

    // Arrow keys navigation
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        const next = tabBtns[(index + 1) % tabBtns.length];
        next.focus();
        next.click();
      } else if (e.key === 'ArrowLeft') {
        const prev = tabBtns[(index - 1 + tabBtns.length) % tabBtns.length];
        prev.focus();
        prev.click();
      }
    });
  });
}

async function loadProfile() {
  try {
    profileData = await api.getCandidateProfile(session.userId);

    document.getElementById('prof-name').value = profileData.name || '';
    document.getElementById('prof-email').value = profileData.email || '';
    document.getElementById('prof-phone').value = profileData.phone || '';
    document.getElementById('prof-location').value = profileData.location || '';
    document.getElementById('prof-headline').value = profileData.headline || '';
    document.getElementById('prof-exp-years').value = profileData.experienceYears || 0;
    document.getElementById('prof-education').value = profileData.education || '';
    document.getElementById('prof-linkedin').value = profileData.linkedin || '';

    skills = [...(profileData.skills || [])];
    renderSkillsTags();

    resumeMeta = profileData.resumeMeta || null;
    renderResumeCard();

    // Mark clean
    isDirty = false;
  } catch (err) {
    showToast(`Error loading profile: ${err.message}`, 'error');
  }
}

function setupSkillsTagInput() {
  const container = document.getElementById('skills-tag-container');
  const input = document.getElementById('skill-text-input');

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.trim().replace(/,$/, '');
      if (val && !skills.includes(val)) {
        skills.push(val);
        input.value = '';
        renderSkillsTags();
        markDirty();
      }
    } else if (e.key === 'Backspace' && input.value === '' && skills.length > 0) {
      skills.pop();
      renderSkillsTags();
      markDirty();
    }
  });

  input.addEventListener('blur', () => {
    const val = input.value.trim().replace(/,$/, '');
    if (val && !skills.includes(val)) {
      skills.push(val);
      input.value = '';
      renderSkillsTags();
      markDirty();
    }
  });
}

function renderSkillsTags() {
  const container = document.getElementById('skills-tag-container');
  const input = document.getElementById('skill-text-input');

  // Remove existing badges
  container.querySelectorAll('.tag-badge').forEach(b => b.remove());

  skills.forEach((skill, idx) => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.innerHTML = `
      <span>${escapeHTML(skill)}</span>
      <span class="tag-badge-remove" role="button" aria-label="Remove skill ${escapeHTML(skill)}">&times;</span>
    `;

    badge.querySelector('.tag-badge-remove').onclick = () => {
      skills.splice(idx, 1);
      renderSkillsTags();
      markDirty();
    };

    container.insertBefore(badge, input);
  });
}

function setupResumeDropzone() {
  const dropzone = document.getElementById('profile-dropzone');
  const fileInput = document.getElementById('profile-file-input');
  const replaceBtn = document.getElementById('btn-replace-resume');
  const removeBtn = document.getElementById('btn-remove-resume');

  dropzone.onclick = () => fileInput.click();
  replaceBtn.onclick = () => fileInput.click();

  removeBtn.onclick = async () => {
    const confirmed = await confirmDialog({
      title: 'Remove Attached Resume',
      message: 'Are you sure you want to remove your resume? You will need to upload a new document to apply for jobs.',
      confirmText: 'Remove',
      danger: true
    });
    if (confirmed) {
      resumeMeta = null;
      renderResumeCard();
      markDirty();
    }
  };

  dropzone.ondragover = (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  };

  dropzone.ondragleave = () => dropzone.classList.remove('dragover');

  dropzone.ondrop = (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      processResumeFile(e.dataTransfer.files[0]);
    }
  };

  fileInput.onchange = () => {
    if (fileInput.files.length > 0) {
      processResumeFile(fileInput.files[0]);
    }
  };

  function processResumeFile(file) {
    const name = file.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      showToast('Only PDF and DOCX files are accepted', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('File size exceeds 2 MB limit', 'error');
      return;
    }

    resumeMeta = {
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/pdf',
      uploadedAt: new Date().toISOString()
    };

    renderResumeCard();
    markDirty();
    showToast('Resume uploaded. Remember to save changes.', 'info');
  }
}

function renderResumeCard() {
  const card = document.getElementById('resume-current-card');
  const dropzone = document.getElementById('profile-dropzone');
  const fileName = document.getElementById('res-file-name');
  const fileMeta = document.getElementById('res-file-meta');

  if (resumeMeta) {
    card.style.display = 'block';
    dropzone.style.display = 'none';
    fileName.textContent = resumeMeta.fileName;
    fileMeta.textContent = `${(resumeMeta.sizeBytes / 1024).toFixed(0)} KB • Uploaded ${formatDate(resumeMeta.uploadedAt)}`;
  } else {
    card.style.display = 'none';
    dropzone.style.display = 'block';
  }
}

function markDirty() {
  isDirty = true;
}

function setupUnsavedWarning() {
  document.querySelectorAll('#profile-form input').forEach(input => {
    input.addEventListener('input', markDirty);
  });

  window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = 'You have unsaved profile changes. Are you sure you want to leave?';
    }
  });

  const saveBtn = document.getElementById('btn-save-profile');
  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    setLoading(saveBtn, true);

    const payload = {
      name: document.getElementById('prof-name').value.trim(),
      phone: document.getElementById('prof-phone').value.trim(),
      location: document.getElementById('prof-location').value.trim(),
      headline: document.getElementById('prof-headline').value.trim(),
      experienceYears: Number(document.getElementById('prof-exp-years').value) || 0,
      education: document.getElementById('prof-education').value.trim(),
      linkedin: document.getElementById('prof-linkedin').value.trim(),
      skills,
      resumeMeta
    };

    try {
      await api.updateCandidateProfile(session.userId, payload);
      isDirty = false;
      showToast('Profile updated successfully!', 'success');
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setLoading(saveBtn, false);
    }
  });
}

})();

/* js/pages/candidate-applications.page.js */
;(() => {
/**
 * HireFlow Candidate Applications Page Controller (candidate-applications.page.js)
 */


let allApplications = [];
let activeFilter = 'all';

HF.onReady('/candidate/applications.html', async () => {
  const session = guardPage(['candidate']);
  if (!session) return;

  setupFilterButtons();
  await loadApplications();
});

function setupFilterButtons() {
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');

      activeFilter = btn.getAttribute('data-filter');
      renderApplicationsTable();
    });
  });
}

async function loadApplications() {
  const tbody = document.getElementById('applications-table-body');
  renderSkeleton(tbody, 'row', 4);

  try {
    allApplications = await api.getApplications();

    // Counts
    const active = allApplications.filter(a => !['Rejected', 'Withdrawn'].includes(a.stage));
    const offered = allApplications.filter(a => a.stage === 'Offered');
    const closed = allApplications.filter(a => ['Rejected', 'Withdrawn'].includes(a.stage));

    document.getElementById('count-all').textContent = allApplications.length;
    document.getElementById('count-active').textContent = active.length;
    document.getElementById('count-offered').textContent = offered.length;
    document.getElementById('count-closed').textContent = closed.length;

    renderApplicationsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="padding: 2rem;">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function renderApplicationsTable() {
  const tbody = document.getElementById('applications-table-body');

  let filtered = allApplications;
  if (activeFilter === 'active') {
    filtered = allApplications.filter(a => !['Rejected', 'Withdrawn'].includes(a.stage));
  } else if (activeFilter === 'Offered') {
    filtered = allApplications.filter(a => a.stage === 'Offered');
  } else if (activeFilter === 'Rejected') {
    filtered = allApplications.filter(a => ['Rejected', 'Withdrawn'].includes(a.stage));
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted" style="padding: 3rem;">
          No applications found in this category.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(app => {
    const isTerminal = ['Rejected', 'Withdrawn'].includes(app.stage);

    return `
      <tr>
        <td data-label="Job Title">
          <div class="font-bold text-sm">${escapeHTML(app.jobTitle)}</div>
        </td>
        <td data-label="Department">${escapeHTML(app.jobDepartment)}</td>
        <td data-label="Current Stage">
          <span class="badge badge-stage-${app.stage.toLowerCase()}">${escapeHTML(app.stage)}</span>
        </td>
        <td data-label="Applied Date">${formatDate(app.appliedAt)}</td>
        <td data-label="Last Update">${relativeTime(app.updatedAt)}</td>
        <td data-label="Actions" style="text-align: right;">
          <div class="flex gap-2 justify-end" style="justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="view-details" data-id="${escapeHTML(app.id)}">
              Timeline Details
            </button>
            ${!isTerminal ? `
              <button type="button" class="btn btn-danger-ghost btn-sm" data-action="withdraw" data-id="${escapeHTML(app.id)}" data-title="${escapeHTML(app.jobTitle)}">
                Withdraw
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach button events
  tbody.querySelectorAll('[data-action="view-details"]').forEach(btn => {
    btn.onclick = () => openApplicationDetails(btn.getAttribute('data-id'));
  });

  tbody.querySelectorAll('[data-action="withdraw"]').forEach(btn => {
    btn.onclick = () => handleWithdraw(btn.getAttribute('data-id'), btn.getAttribute('data-title'));
  });
}

async function handleWithdraw(appId, jobTitle) {
  const confirmed = await confirmDialog({
    title: 'Withdraw Application',
    message: `Are you sure you want to withdraw your application for "${jobTitle}"? This will terminate your candidacy and notify the hiring team.`,
    confirmText: 'Confirm Withdrawal',
    danger: true
  });

  if (confirmed) {
    try {
      await api.withdrawApplication(appId);
      showToast('Application successfully withdrawn.', 'info');
      await loadApplications();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

async function openApplicationDetails(appId) {
  const drawerContent = document.getElementById('drawer-app-content');
  drawerContent.innerHTML = `<div class="skeleton" style="height: 200px;"></div>`;
  openDrawer('application-detail-drawer');

  try {
    const app = await api.getApplicationById(appId);

    drawerContent.innerHTML = `
      <div style="margin-bottom: var(--space-6);">
        <h2 style="font-size: var(--font-size-md); margin-bottom: var(--space-1);">${escapeHTML(app.job ? app.job.title : 'Application')}</h2>
        <div class="text-xs text-muted" style="margin-bottom: var(--space-3);">${escapeHTML(app.job ? app.job.department : '')} • Applied ${formatDate(app.appliedAt)}</div>
        <span class="badge badge-stage-${app.stage.toLowerCase()}">${escapeHTML(app.stage)}</span>
      </div>

      ${app.coverNote ? `
        <div style="background: var(--surface-2); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-6);">
          <div class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: 4px;">Cover Note</div>
          <p class="text-sm" style="margin: 0; color: var(--text);">${escapeHTML(app.coverNote)}</p>
        </div>
      ` : ''}

      <div style="margin-bottom: var(--space-6);">
        <h4 style="font-size: var(--font-size-sm); margin-bottom: var(--space-3);">Stage Audit Trail</h4>
        <div class="timeline">
          ${(app.history || []).map(h => `
            <div class="timeline-item">
              <div class="timeline-point"></div>
              <div class="timeline-title">${h.fromStage ? `${escapeHTML(h.fromStage)} → ` : ''}${escapeHTML(h.toStage)}</div>
              <div class="timeline-meta">${formatDateTime(h.at)}</div>
              ${h.note ? `<p class="text-sm text-muted" style="margin-top: 4px; margin-bottom: 0;">${escapeHTML(h.note)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    drawerContent.innerHTML = `<div class="error-state"><p>${escapeHTML(err.message)}</p></div>`;
  }
}

})();

/* js/pages/candidate-interviews.page.js */
;(() => {
/**
 * HireFlow Candidate Interviews Controller (candidate-interviews.page.js)
 */


HF.onReady('/candidate/interviews.html', async () => {
  const session = guardPage(['candidate']);
  if (!session) return;

  await loadCandidateInterviews();
});

async function loadCandidateInterviews() {
  const container = document.getElementById('candidate-interviews-container');
  renderSkeleton(container, 'card', 3);

  try {
    const list = await api.getInterviews();

    if (list.length === 0) {
      renderEmpty(
        container,
        'No interviews scheduled',
        'When your recruiter schedules an interview, it will appear here along with meeting links and calendar options.'
      );
      return;
    }

    // Sort by startsAt ascending
    list.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    container.innerHTML = `
      <div class="grid gap-4" style="grid-template-columns: 1fr;">
        ${list.map(int => {
          const isVideo = int.mode === 'Video';
          const isCompleted = int.status === 'completed';
          const isCancelled = int.status === 'cancelled';

          return `
            <div class="card" style="border-left: 4px solid var(--${isCompleted ? 'success' : (isCancelled ? 'danger' : 'primary')});">
              <div class="flex justify-between items-center" style="margin-bottom: var(--space-2); flex-wrap: wrap;">
                <div class="flex items-center gap-2">
                  <span class="badge badge-primary">${escapeHTML(int.mode)}</span>
                  <span class="badge badge-${isCompleted ? 'success' : (isCancelled ? 'danger' : 'default')}">
                    ${escapeHTML(int.status)}
                  </span>
                </div>
                <span class="text-xs text-muted font-semibold">${int.durationMin} minutes</span>
              </div>

              <h2 style="font-size: var(--font-size-md); margin-bottom: var(--space-2);">${escapeHTML(int.title)}</h2>

              <div class="job-card-meta" style="margin-bottom: var(--space-4);">
                <span class="job-card-meta-item">
                  📅 <strong>${formatDate(int.startsAt)}</strong> at <strong>${formatTime(int.startsAt)}</strong>
                </span>
                <span class="job-card-meta-item">
                  📍 ${escapeHTML(int.location || 'Online / Remote')}
                </span>
              </div>

              <div class="flex gap-2" style="flex-wrap: wrap;">
                ${isVideo && int.location && int.location.startsWith('http') && !isCancelled ? `
                  <a href="${escapeHTML(int.location)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">
                    Join Video Conference
                  </a>
                ` : ''}
                ${!isCancelled ? `
                  <button type="button" class="btn btn-secondary btn-sm" data-action="download-ics" data-id="${escapeHTML(int.id)}">
                    📅 Add to Calendar (.ics)
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Attach ICS download handlers
    container.querySelectorAll('[data-action="download-ics"]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        const ev = list.find(item => item.id === id);
        if (ev) downloadICS(ev);
      };
    });
  } catch (err) {
    container.innerHTML = `<div class="error-state"><p>${escapeHTML(err.message)}</p></div>`;
  }
}

/**
 * Generate and trigger download of .ics iCalendar file
 * @param {Object} ev 
 */
function downloadICS(ev) {
  const start = new Date(ev.startsAt);
  const end = new Date(start.getTime() + (ev.durationMin || 45) * 60 * 1000);

  const formatICSDate = (d) => {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HireFlow//Smart ATS//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:hireflow-${ev.id}@example.com`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${ev.title}`,
    `DESCRIPTION:HireFlow Interview for ${ev.title}. Mode: ${ev.mode}`,
    `LOCATION:${ev.location || 'Online'}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Interview-${ev.title.replace(/\s+/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Calendar (.ics) downloaded!', 'success');
}

})();

/* js/pages/hr-dashboard.page.js */
;(() => {
/**
 * HireFlow HR Dashboard Controller (hr-dashboard.page.js)
 */


HF.onReady('/hr/dashboard.html', async () => {
  const session = guardPage(['hr', 'admin']);
  if (!session) return;

  await loadDashboardMetrics();
});

async function loadDashboardMetrics() {
  try {
    const [jobs, apps, interviews, offers, activity] = await Promise.all([
      api.getJobs(),
      api.getApplications(),
      api.getInterviews(),
      api.getOffers(),
      api.getActivityLog()
    ]);

    // 1. KPI Cards
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const openJobs = jobs.filter(j => j.status === 'published');
    const newAppsThisWeek = apps.filter(a => new Date(a.appliedAt) >= oneWeekAgo);
    const interviewsThisWeek = interviews.filter(i => {
      const d = new Date(i.startsAt);
      return d >= oneWeekAgo && d <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) && i.status !== 'cancelled';
    });
    const pendingOffers = offers.filter(o => ['draft', 'issued'].includes(o.status));

    document.getElementById('kpi-open-jobs').textContent = openJobs.length;
    document.getElementById('kpi-new-apps').textContent = newAppsThisWeek.length;
    document.getElementById('kpi-interviews-week').textContent = interviewsThisWeek.length;
    document.getElementById('kpi-pending-offers').textContent = pendingOffers.length;

    // 2. Stale Candidates (Needs Attention > 7 days in active stage)
    const staleApps = apps.filter(a => {
      if (['Rejected', 'Withdrawn'].includes(a.stage)) return false;
      const days = daysBetween(a.updatedAt, now);
      return days >= 7;
    }).sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));

    const staleListEl = document.getElementById('stale-candidates-list');
    document.getElementById('badge-stale-count').textContent = staleApps.length;

    if (staleApps.length === 0) {
      staleListEl.innerHTML = `<div class="text-sm text-muted" style="padding: 1rem 0;">All active candidates have been updated recently. Great job!</div>`;
    } else {
      staleListEl.innerHTML = staleApps.slice(0, 5).map(app => {
        const daysStuck = daysBetween(app.updatedAt, now);
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--border);">
            <div>
              <div class="font-bold text-sm">${escapeHTML(app.candidateName)}</div>
              <div class="text-xs text-muted">${escapeHTML(app.jobTitle)} • <span class="badge badge-stage-${app.stage.toLowerCase()}">${escapeHTML(app.stage)}</span></div>
            </div>
            <div style="text-align: right;">
              <span class="days-in-stage-badge stale">${daysStuck} days stuck</span>
              <div>
                <a href="pipeline.html?appId=${encodeURIComponent(app.id)}" class="text-xs font-semibold" style="margin-top: 2px; display: inline-block;">Take Action →</a>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // 3. Mini Funnel Chart
    const funnelContainer = document.getElementById('dashboard-funnel-chart');
    const stages = ['Applied', 'Screening', 'Interview', 'Selected', 'Offered'];
    const funnelData = stages.map(stage => ({
      stage,
      count: apps.filter(a => a.stage === stage).length
    }));
    renderFunnelChart(funnelContainer, funnelData);

    // 4. Recent Activity Feed
    const activityContainer = document.getElementById('recent-activity-list');
    if (!activity || activity.length === 0) {
      activityContainer.innerHTML = `<div class="text-sm text-muted">No recent activities logged.</div>`;
    } else {
      activityContainer.innerHTML = activity.slice(0, 8).map(act => `
        <div class="timeline-item">
          <div class="timeline-point"></div>
          <div class="timeline-title">
            ${escapeHTML(act.meta?.candidateName || 'Candidate')} moved to <strong>${escapeHTML(act.meta?.toStage || act.meta?.stage || 'next stage')}</strong>
          </div>
          <div class="timeline-meta">
            ${escapeHTML(act.meta?.jobTitle || 'Job')} • ${relativeTime(act.at)}
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading HR dashboard metrics:', err);
  }
}

})();

/* js/pages/hr-jobs.page.js */
;(() => {
/**
 * HireFlow HR Jobs Controller (hr-jobs.page.js)
 */


let allJobs = [];
let allApplications = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

HF.onReady('/hr/jobs.html', async () => {
  const session = guardPage(['hr', 'admin']);
  if (!session) return;

  setupToolbars();
  setupJobModal();
  await loadData();
});

function setupToolbars() {
  const searchInput = document.getElementById('jobs-search-input');
  const statusFilter = document.getElementById('jobs-status-filter');
  const deptFilter = document.getElementById('jobs-dept-filter');

  const onFilterChange = () => {
    currentPage = 1;
    renderJobsTable();
  };

  searchInput.addEventListener('input', onFilterChange);
  statusFilter.addEventListener('change', onFilterChange);
  deptFilter.addEventListener('change', onFilterChange);

  document.getElementById('btn-create-job').onclick = () => {
    openJobFormModal(null);
  };
}

async function loadData() {
  const tbody = document.getElementById('hr-jobs-table-body');
  renderSkeleton(tbody, 'row', 5);

  try {
    const [jobs, apps] = await Promise.all([
      api.getJobs(),
      api.getApplications()
    ]);
    allJobs = jobs;
    allApplications = apps;
    renderJobsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger" style="padding: 2rem;">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function getFilteredJobs() {
  const q = document.getElementById('jobs-search-input').value.trim().toLowerCase();
  const status = document.getElementById('jobs-status-filter').value;
  const dept = document.getElementById('jobs-dept-filter').value;

  return allJobs.filter(j => {
    if (q && !j.title.toLowerCase().includes(q) && !j.department.toLowerCase().includes(q)) return false;
    if (status && j.status !== status) return false;
    if (dept && j.department !== dept) return false;
    return true;
  });
}

function renderJobsTable() {
  const tbody = document.getElementById('hr-jobs-table-body');
  const pagination = document.getElementById('hr-jobs-pagination');

  const filtered = getFilteredJobs();

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 3rem;">No jobs match your filter criteria.</td></tr>`;
    pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

  tbody.innerHTML = pageItems.map(job => {
    const appCount = allApplications.filter(a => a.jobId === job.id).length;
    const isClosed = job.status === 'closed' || (job.closesAt && new Date(job.closesAt) < new Date());

    return `
      <tr>
        <td data-label="Job Title">
          <div class="font-bold text-sm">${escapeHTML(job.title)}</div>
          <div class="text-xs text-muted">${escapeHTML(job.type)} • ${escapeHTML(job.experience)} yrs</div>
        </td>
        <td data-label="Department">${escapeHTML(job.department)}</td>
        <td data-label="Status">
          <span class="badge badge-${job.status === 'published' ? 'success' : (job.status === 'draft' ? 'warning' : 'default')}">
            ${escapeHTML(job.status)}
          </span>
        </td>
        <td data-label="Applicants">
          <a href="pipeline.html?jobId=${encodeURIComponent(job.id)}" class="font-bold" title="Open in pipeline">
            ${appCount} candidate${appCount === 1 ? '' : 's'}
          </a>
        </td>
        <td data-label="Posted Date">${formatDate(job.postedAt)}</td>
        <td data-label="Closing Date">${job.closesAt ? formatDate(job.closesAt) : 'Ongoing'}</td>
        <td data-label="Actions" style="text-align: right;">
          <div class="flex gap-1 justify-end" style="justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${escapeHTML(job.id)}">Edit</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="duplicate" data-id="${escapeHTML(job.id)}" title="Duplicate Job">Copy</button>
            ${job.status === 'published' ? `
              <button type="button" class="btn btn-danger-ghost btn-sm" data-action="close" data-id="${escapeHTML(job.id)}">Close</button>
            ` : (job.status === 'draft' || job.status === 'closed' ? `
              <button type="button" class="btn btn-success btn-sm" data-action="publish" data-id="${escapeHTML(job.id)}">Publish</button>
            ` : '')}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach row actions
  tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.onclick = () => {
      const job = allJobs.find(j => j.id === btn.getAttribute('data-id'));
      if (job) openJobFormModal(job);
    };
  });

  tbody.querySelectorAll('[data-action="duplicate"]').forEach(btn => {
    btn.onclick = async () => {
      try {
        await api.duplicateJob(btn.getAttribute('data-id'));
        showToast('Job duplicated successfully as draft.', 'success');
        await loadData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });

  tbody.querySelectorAll('[data-action="close"]').forEach(btn => {
    btn.onclick = async () => {
      const confirmed = await confirmDialog({
        title: 'Close Job Position',
        message: 'Are you sure you want to close applications for this job? Candidates will no longer be able to submit new applications.',
        confirmText: 'Close Position',
        danger: true
      });
      if (confirmed) {
        await api.updateJob(btn.getAttribute('data-id'), { status: 'closed' });
        showToast('Job closed.', 'info');
        await loadData();
      }
    };
  });

  tbody.querySelectorAll('[data-action="publish"]').forEach(btn => {
    btn.onclick = async () => {
      await api.updateJob(btn.getAttribute('data-id'), { status: 'published' });
      showToast('Job published to career board!', 'success');
      await loadData();
    };
  });

  // Render pagination
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const pagination = document.getElementById('hr-jobs-pagination');
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `
      <button type="button" class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>
    `;
  }
  pagination.innerHTML = html;

  pagination.querySelectorAll('[data-page]').forEach(btn => {
    btn.onclick = () => {
      currentPage = Number(btn.getAttribute('data-page'));
      renderJobsTable();
    };
  });
}

function openJobFormModal(job = null) {
  const modal = document.getElementById('job-modal');
  const title = document.getElementById('modal-job-title');
  const form = document.getElementById('job-form');

  form.reset();

  if (job) {
    title.textContent = 'Edit Job Posting';
    document.getElementById('job-form-id').value = job.id;
    document.getElementById('job-title-input').value = job.title;
    document.getElementById('job-dept-input').value = job.department;
    document.getElementById('job-location-input').value = job.location;
    document.getElementById('job-type-input').value = job.type;
    document.getElementById('job-exp-input').value = job.experience;
    document.getElementById('job-salmin-input').value = job.salaryMin;
    document.getElementById('job-salmax-input').value = job.salaryMax;
    document.getElementById('job-closes-input').value = formatDateInput(job.closesAt);
    document.getElementById('job-desc-input').value = job.description;
    document.getElementById('job-reqs-input').value = job.requirements.join('\n');
    document.getElementById('job-skills-input').value = job.skills.join(', ');
  } else {
    title.textContent = 'Create Job Posting';
    document.getElementById('job-form-id').value = '';
    // default closes in 30 days
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    document.getElementById('job-closes-input').value = formatDateInput(nextMonth);
  }

  openModal('job-modal');
}

function setupJobModal() {
  const form = document.getElementById('job-form');
  const saveBtn = document.getElementById('btn-save-job');

  form.onsubmit = async (e) => {
    e.preventDefault();

    const jobId = document.getElementById('job-form-id').value;
    const title = document.getElementById('job-title-input').value.trim();
    const dept = document.getElementById('job-dept-input').value;
    const location = document.getElementById('job-location-input').value.trim();
    const type = document.getElementById('job-type-input').value;
    const exp = document.getElementById('job-exp-input').value;
    const salMin = Number(document.getElementById('job-salmin-input').value);
    const salMax = Number(document.getElementById('job-salmax-input').value);
    const closesAt = document.getElementById('job-closes-input').value;
    const desc = document.getElementById('job-desc-input').value.trim();
    const reqsRaw = document.getElementById('job-reqs-input').value.trim();
    const skillsRaw = document.getElementById('job-skills-input').value.trim();

    // Validation
    if (title.length < 5 || title.length > 100) {
      showToast('Title must be between 5 and 100 characters', 'error');
      return;
    }
    if (salMin > salMax) {
      showToast('Minimum salary cannot exceed maximum salary', 'error');
      return;
    }
    if (new Date(closesAt).getTime() <= Date.now()) {
      showToast('Closing date must be in the future', 'error');
      return;
    }
    const requirements = reqsRaw.split('\n').map(r => r.trim()).filter(Boolean);
    if (requirements.length === 0) {
      showToast('At least one requirement item is required', 'error');
      return;
    }

    const skills = skillsRaw.split(',').map(s => s.trim()).filter(Boolean);

    setLoading(saveBtn, true);

    const payload = {
      title,
      department: dept,
      location,
      type,
      experience: exp,
      salaryMin: salMin,
      salaryMax: salMax,
      closesAt: new Date(closesAt).toISOString(),
      description: desc,
      requirements,
      skills,
      status: 'published'
    };

    try {
      if (jobId) {
        await api.updateJob(jobId, payload);
        showToast('Job updated successfully!', 'success');
      } else {
        await api.createJob(payload);
        showToast('New job posted successfully!', 'success');
      }
      closeModal('job-modal');
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(saveBtn, false);
    }
  };
}

})();

/* js/pages/hr-pipeline.page.js */
;(() => {
/**
 * HireFlow HR Pipeline Kanban & Table View Controller (hr-pipeline.page.js)
 * Flagship interactive recruiter workspace.
 */


let allApplications = [];
let allJobs = [];
let currentView = 'kanban'; // 'kanban' | 'table'
let activeAppIdInDrawer = null;
let dndController = null;
let tablePage = 1;
const TABLE_PAGE_SIZE = 10;

HF.onReady('/hr/pipeline.html', async () => {
  const session = guardPage(['hr', 'admin']);
  if (!session) return;

  setupDnD();
  setupControls();
  await loadData();

  // If URL has ?appId=, auto-open drawer
  const params = new URLSearchParams(HF.location.search);
  const targetAppId = params.get('appId');
  if (targetAppId) {
    setTimeout(() => openCandidateDrawer(targetAppId), 300);
  }
});

function setupDnD() {
  dndController = new KanbanDnD({
    getAllowedStages: (stage) => getAllowedTransitions(stage, 'hr'),
    onMove: async (appId, targetStage) => {
      try {
        await api.moveApplicationStage(appId, targetStage);
        showToast(`Moved to ${targetStage}`, 'success');
        await loadData();
        return true;
      } catch (err) {
        showToast(err.message, 'error', 5000);
        // If the error asks for scheduling an interview, offer to open modal
        if (err.message.includes('interview')) {
          openScheduleInterviewModal(appId);
        }
        return false;
      }
    }
  });

  const board = document.getElementById('pipeline-kanban-view');
  dndController.bind(board);
}

function setupControls() {
  const kanbanBtn = document.getElementById('view-kanban-btn');
  const tableBtn = document.getElementById('view-table-btn');
  const kanbanView = document.getElementById('pipeline-kanban-view');
  const tableView = document.getElementById('pipeline-table-view');
  const exportCsvBtn = document.getElementById('btn-export-csv');
  const rulesBtn = document.getElementById('btn-show-rules');

  kanbanBtn.onclick = () => {
    currentView = 'kanban';
    kanbanBtn.classList.replace('btn-ghost', 'btn-primary');
    tableBtn.classList.replace('btn-primary', 'btn-ghost');
    kanbanView.style.display = 'flex';
    tableView.style.display = 'none';
    exportCsvBtn.style.display = 'none';
  };

  tableBtn.onclick = () => {
    currentView = 'table';
    tableBtn.classList.replace('btn-ghost', 'btn-primary');
    kanbanBtn.classList.replace('btn-primary', 'btn-ghost');
    kanbanView.style.display = 'none';
    tableView.style.display = 'block';
    exportCsvBtn.style.display = 'inline-flex';
    renderTableView();
  };

  rulesBtn.onclick = () => openModal('rules-modal');

  document.getElementById('pipeline-job-select').onchange = () => refreshViews();
  document.getElementById('pipeline-search-input').oninput = () => refreshViews();
  document.getElementById('pipeline-rating-select').onchange = () => refreshViews();

  exportCsvBtn.onclick = () => exportFilteredCSV();

  setupScheduleModal();
}

async function loadData() {
  try {
    const [jobs, apps] = await Promise.all([
      api.getJobs(),
      api.getApplications()
    ]);
    allJobs = jobs;
    allApplications = apps;

    populateJobSelect();
    refreshViews();
  } catch (err) {
    showToast(`Error loading pipeline: ${err.message}`, 'error');
  }
}

function populateJobSelect() {
  const select = document.getElementById('pipeline-job-select');
  const currentVal = select.value;
  select.innerHTML = `<option value="">All Job Positions (${allJobs.length})</option>`;
  allJobs.forEach(job => {
    const opt = document.createElement('option');
    opt.value = job.id;
    opt.textContent = `${job.title} (${job.department})`;
    select.appendChild(opt);
  });
  if (currentVal) select.value = currentVal;

  // Check URL param jobId
  const urlParams = new URLSearchParams(HF.location.search);
  const jobIdParam = urlParams.get('jobId');
  if (jobIdParam) select.value = jobIdParam;
}

function getFilteredApplications() {
  const jobFilter = document.getElementById('pipeline-job-select').value;
  const search = document.getElementById('pipeline-search-input').value.trim().toLowerCase();
  const ratingFilter = document.getElementById('pipeline-rating-select').value;

  return allApplications.filter(app => {
    if (jobFilter && app.jobId !== jobFilter) return false;
    if (ratingFilter && (!app.rating || app.rating < Number(ratingFilter))) return false;
    if (search) {
      const nameMatches = app.candidateName.toLowerCase().includes(search);
      const jobMatches = app.jobTitle.toLowerCase().includes(search);
      const skillMatches = app.candidateSkills && app.candidateSkills.some(s => s.toLowerCase().includes(search));
      if (!nameMatches && !jobMatches && !skillMatches) return false;
    }
    return true;
  });
}

function refreshViews() {
  if (currentView === 'kanban') {
    renderKanbanColumns();
  } else {
    renderTableView();
  }
}

function renderKanbanColumns() {
  const filtered = getFilteredApplications();
  const stages = ['Applied', 'Screening', 'Interview', 'Selected', 'Offered'];
  const now = new Date();

  // Reset columns
  stages.forEach(st => {
    const colList = document.getElementById(`col-${st}`);
    const countBadge = document.getElementById(`count-${st}`);
    if (colList) colList.innerHTML = '';
    if (countBadge) countBadge.textContent = '0';
  });

  const rejectedCol = document.getElementById('col-Rejected');
  const rejectedCount = document.getElementById('count-Rejected');
  if (rejectedCol) rejectedCol.innerHTML = '';
  if (rejectedCount) rejectedCount.textContent = '0';

  const counts = { Applied: 0, Screening: 0, Interview: 0, Selected: 0, Offered: 0, Rejected: 0 };

  filtered.forEach(app => {
    const isTerminal = ['Rejected', 'Withdrawn'].includes(app.stage);
    const targetColId = isTerminal ? 'col-Rejected' : `col-${app.stage}`;
    const list = document.getElementById(targetColId);

    if (isTerminal) counts.Rejected++;
    else if (counts[app.stage] !== undefined) counts[app.stage]++;

    if (!list) return;

    const daysStuck = daysBetween(app.updatedAt, now);
    const isStale = daysStuck >= 7 && !isTerminal;

    // Render Card
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.setAttribute('draggable', 'true');
    card.setAttribute('data-id', app.id);
    card.setAttribute('data-stage', app.stage);
    card.tabIndex = 0;

    const allowed = getAllowedTransitions(app.stage, 'hr');

    // Build star rating
    let starsHtml = '';
    if (app.rating) {
      starsHtml = '★'.repeat(app.rating) + '☆'.repeat(5 - app.rating);
    }

    card.innerHTML = `
      <div class="kanban-card-header">
        <div class="flex items-center gap-2">
          ${renderAvatar(app.candidateName, 'xs')}
          <span class="kanban-card-title">${escapeHTML(app.candidateName)}</span>
        </div>
        <!-- Keyboard accessible Move To dropdown -->
        ${allowed.length > 0 ? `
          <div class="dropdown">
            <button type="button" class="btn-icon btn-ghost btn-sm" data-action="move-menu" aria-label="Move stage menu" title="Move Candidate">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
            </button>
            <div class="dropdown-menu">
              <div style="padding: 4px 8px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Move to:</div>
              ${allowed.map(st => `
                <button type="button" class="dropdown-item" data-move-to="${st}">${st}</button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="kanban-card-job">${escapeHTML(app.jobTitle)}</div>

      ${app.candidateSkills && app.candidateSkills.length > 0 ? `
        <div class="flex gap-1" style="flex-wrap: wrap; margin-bottom: 8px;">
          ${app.candidateSkills.slice(0, 2).map(s => `<span class="badge badge-default" style="font-size: 10px; padding: 1px 5px;">${escapeHTML(s)}</span>`).join('')}
        </div>
      ` : ''}

      <div class="kanban-card-footer">
        <div>
          ${starsHtml ? `<span style="color: var(--warning); font-size: 11px;">${starsHtml}</span>` : '<span class="text-xs text-muted">Unrated</span>'}
        </div>
        <span class="days-in-stage-badge ${isStale ? 'stale' : ''}">
          ${daysStuck}d in stage
        </span>
      </div>
    `;

    // Card click opens drawer (unless clicked on menu)
    card.onclick = (e) => {
      if (e.target.closest('.dropdown')) return;
      openCandidateDrawer(app.id);
    };

    // Keyboard menu handlers
    card.querySelectorAll('[data-move-to]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const toStage = btn.getAttribute('data-move-to');
        try {
          await api.moveApplicationStage(app.id, toStage);
          showToast(`Candidate moved to ${toStage}`, 'success');
          await loadData();
        } catch (err) {
          showToast(err.message, 'error');
          if (err.message.includes('interview')) {
            openScheduleInterviewModal(app.id);
          }
        }
      };
    });

    dndController.attachKeyboardMenu(card, allowed);
    list.appendChild(card);
  });

  // Update counts
  stages.forEach(st => {
    document.getElementById(`count-${st}`).textContent = counts[st];
  });
  document.getElementById('count-Rejected').textContent = counts.Rejected;
}

function renderTableView() {
  const tbody = document.getElementById('pipeline-table-body');
  const pagination = document.getElementById('pipeline-table-pagination');
  const filtered = getFilteredApplications();
  const now = new Date();

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 3rem;">No applications found matching your criteria.</td></tr>`;
    pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filtered.length / TABLE_PAGE_SIZE);
  if (tablePage > totalPages) tablePage = totalPages;
  const start = (tablePage - 1) * TABLE_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + TABLE_PAGE_SIZE);

  tbody.innerHTML = pageItems.map(app => {
    const daysStuck = daysBetween(app.updatedAt, now);
    let starsHtml = '—';
    if (app.rating) {
      starsHtml = '★'.repeat(app.rating);
    }

    return `
      <tr>
        <td data-label="Candidate">
          <div class="flex items-center gap-2">
            ${renderAvatar(app.candidateName, 'xs')}
            <div>
              <div class="font-bold text-sm">${escapeHTML(app.candidateName)}</div>
              <div class="text-xs text-muted">${escapeHTML(app.candidateEmail)}</div>
            </div>
          </div>
        </td>
        <td data-label="Job Title">${escapeHTML(app.jobTitle)}</td>
        <td data-label="Current Stage">
          <span class="badge badge-stage-${app.stage.toLowerCase()}">${escapeHTML(app.stage)}</span>
        </td>
        <td data-label="Rating" style="color: var(--warning);">${starsHtml}</td>
        <td data-label="Days in Stage">${daysStuck} days</td>
        <td data-label="Applied Date">${formatDate(app.appliedAt)}</td>
        <td data-label="Action" style="text-align: right;">
          <button type="button" class="btn btn-secondary btn-sm" data-action="inspect" data-id="${escapeHTML(app.id)}">
            Inspect Profile
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-action="inspect"]').forEach(btn => {
    btn.onclick = () => openCandidateDrawer(btn.getAttribute('data-id'));
  });

  // Pagination
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button type="button" class="page-btn ${i === tablePage ? 'active' : ''}" data-p="${i}">${i}</button>`;
  }
  pagination.innerHTML = html;
  pagination.querySelectorAll('[data-p]').forEach(btn => {
    btn.onclick = () => {
      tablePage = Number(btn.getAttribute('data-p'));
      renderTableView();
    };
  });
}

function exportFilteredCSV() {
  const filtered = getFilteredApplications();
  const headers = ['Application ID', 'Candidate Name', 'Candidate Email', 'Job Title', 'Current Stage', 'Rating', 'Applied Date', 'Last Updated'];
  
  const rows = filtered.map(a => [
    sanitizeCSV(a.id),
    sanitizeCSV(a.candidateName),
    sanitizeCSV(a.candidateEmail),
    sanitizeCSV(a.jobTitle),
    sanitizeCSV(a.stage),
    sanitizeCSV(a.rating || 'N/A'),
    sanitizeCSV(a.appliedAt),
    sanitizeCSV(a.updatedAt)
  ]);

  const csvContent = '\uFEFF' + [headers.map(sanitizeCSV).join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `HireFlow-Pipeline-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Sanitized CSV report downloaded.', 'success');
}

/**
 * Open Candidate Detail Drawer
 * @param {string} appId 
 */
async function openCandidateDrawer(appId) {
  activeAppIdInDrawer = appId;
  const content = document.getElementById('drawer-cand-content');
  const footer = document.getElementById('drawer-cand-footer');
  const title = document.getElementById('drawer-cand-name');
  const headline = document.getElementById('drawer-cand-headline');

  content.innerHTML = `<div class="skeleton" style="height: 300px;"></div>`;
  openDrawer('candidate-drawer');

  try {
    const app = await api.getApplicationById(appId);
    title.textContent = app.candidateName;
    headline.textContent = app.profile?.headline || `${app.jobTitle} Candidate`;

    const isTerminal = ['Rejected', 'Withdrawn'].includes(app.stage);
    const allowed = getAllowedTransitions(app.stage, 'hr');

    content.innerHTML = `
      <div style="border-bottom: 1px solid var(--border); padding-bottom: var(--space-4); margin-bottom: var(--space-4);">
        <div class="flex justify-between items-center" style="margin-bottom: var(--space-2);">
          <span class="badge badge-stage-${app.stage.toLowerCase()}" style="font-size: 13px;">${escapeHTML(app.stage)}</span>
          <span class="text-xs text-muted">Applied ${formatDate(app.appliedAt)}</span>
        </div>
        <div class="text-sm"><strong>Applying for:</strong> ${escapeHTML(app.jobTitle)}</div>
        <div class="text-xs text-muted" style="margin-top: 2px;">
          📧 ${escapeHTML(app.candidateEmail)} • 📞 ${escapeHTML(app.profile?.phone || 'N/A')} • 📍 ${escapeHTML(app.profile?.location || 'Remote')}
        </div>
      </div>

      <!-- Rating Control -->
      <div style="margin-bottom: var(--space-4); background: var(--surface-2); padding: var(--space-3); border-radius: var(--radius-md);">
        <div class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: 4px;">Candidate Score / Rating</div>
        <div class="flex gap-2 items-center">
          <div id="drawer-rating-stars" style="color: var(--warning); font-size: 1.25rem; cursor: pointer;">
            ${[1, 2, 3, 4, 5].map(star => `
              <span data-star="${star}" title="${star} stars">${star <= (app.rating || 0) ? '★' : '☆'}</span>
            `).join('')}
          </div>
          <span class="text-xs text-muted font-semibold" id="drawer-rating-val">${app.rating ? `${app.rating} / 5` : 'Not yet rated'}</span>
        </div>
      </div>

      <!-- Skills -->
      ${app.candidateSkills && app.candidateSkills.length > 0 ? `
        <div style="margin-bottom: var(--space-4);">
          <div class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: 6px;">Skills</div>
          <div class="flex gap-2" style="flex-wrap: wrap;">
            ${app.candidateSkills.map(s => `<span class="badge badge-primary">${escapeHTML(s)}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Resume Metadata -->
      <div style="margin-bottom: var(--space-4); border: 1px solid var(--border); padding: var(--space-3); border-radius: var(--radius-md);">
        <div class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: 4px;">Attached Resume</div>
        <div class="flex justify-between items-center">
          <div>
            <div class="font-bold text-sm">${escapeHTML(app.resumeMeta?.fileName || 'Resume.pdf')}</div>
            <div class="text-xs text-muted">${app.resumeMeta?.sizeBytes ? `${(app.resumeMeta.sizeBytes / 1024).toFixed(0)} KB` : 'Verified Document'}</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-mock-view-resume">Inspect Resume</button>
        </div>
      </div>

      <!-- Cover Note -->
      ${app.coverNote ? `
        <div style="margin-bottom: var(--space-4); background: var(--surface-2); padding: var(--space-3); border-radius: var(--radius-md);">
          <div class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: 4px;">Candidate Cover Note</div>
          <p class="text-sm" style="margin: 0;">${escapeHTML(app.coverNote)}</p>
        </div>
      ` : ''}

      <!-- Quick Action Buttons -->
      <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-6); flex-wrap: wrap;">
        <button type="button" class="btn btn-primary btn-sm" id="btn-drawer-schedule">📅 Schedule Interview</button>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-drawer-create-offer">📝 Create Offer Letter</button>
        ${!isTerminal ? `
          <button type="button" class="btn btn-danger-ghost btn-sm" id="btn-drawer-reject">✕ Reject Candidate</button>
        ` : ''}
      </div>

      <!-- Stage Audit Trail -->
      <div>
        <h4 style="font-size: var(--font-size-sm); margin-bottom: var(--space-3);">Stage History & Audit Trail</h4>
        <div class="timeline">
          ${(app.history || []).map(h => `
            <div class="timeline-item">
              <div class="timeline-point"></div>
              <div class="timeline-title">${h.fromStage ? `${escapeHTML(h.fromStage)} → ` : ''}${escapeHTML(h.toStage)}</div>
              <div class="timeline-meta">${formatDateTime(h.at)}</div>
              ${h.note ? `<p class="text-sm text-muted" style="margin-top: 4px; margin-bottom: 0;">${escapeHTML(h.note)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Bind rating star clicks
    content.querySelectorAll('[data-star]').forEach(starEl => {
      starEl.onclick = async () => {
        const star = Number(starEl.getAttribute('data-star'));
        await api.updateApplicationRating(appId, star);
        showToast(`Rating updated to ${star} stars`, 'success');
        openCandidateDrawer(appId);
        refreshViews();
      };
    });

    document.getElementById('btn-mock-view-resume').onclick = () => {
      showToast('Opening verified candidate resume viewer (simulated)', 'info');
    };

    document.getElementById('btn-drawer-schedule').onclick = () => {
      openScheduleInterviewModal(appId);
    };

    document.getElementById('btn-drawer-create-offer').onclick = () => {
      HF.go(`offers.html?appId=${encodeURIComponent(appId)}`);
    };

    const rejectBtn = document.getElementById('btn-drawer-reject');
    if (rejectBtn) {
      rejectBtn.onclick = async () => {
        const reason = prompt('Please provide a required reason for rejection (this will be added to the immutable audit log):');
        if (reason && reason.trim()) {
          await api.moveApplicationStage(appId, 'Rejected', `Rejected: ${reason.trim()}`);
          showToast('Candidate moved to Rejected.', 'info');
          closeDrawer('candidate-drawer');
          await loadData();
        } else if (reason !== null) {
          showToast('A rejection reason is required for compliance audit trails.', 'error');
        }
      };
    }
  } catch (err) {
    content.innerHTML = `<div class="error-state"><p>${escapeHTML(err.message)}</p></div>`;
  }
}

function openScheduleInterviewModal(appId) {
  document.getElementById('sched-app-id').value = appId;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  document.getElementById('sched-date').value = formatDateInput(tomorrow);
  openModal('schedule-interview-modal');
}

function setupScheduleModal() {
  const form = document.getElementById('schedule-interview-form');
  const saveBtn = document.getElementById('btn-save-sched');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const appId = document.getElementById('sched-app-id').value;
    const title = document.getElementById('sched-title').value.trim();
    const date = document.getElementById('sched-date').value;
    const time = document.getElementById('sched-time').value;
    const durationMin = document.getElementById('sched-duration').value;
    const mode = document.getElementById('sched-mode').value;
    const location = document.getElementById('sched-location').value.trim();

    if (!date || !time) {
      showToast('Please specify interview date and time', 'error');
      return;
    }

    const startsAt = new Date(`${date}T${time}`).toISOString();
    if (new Date(startsAt).getTime() <= Date.now()) {
      showToast('Interview must be scheduled for a future time', 'error');
      return;
    }

    setLoading(saveBtn, true);

    try {
      await api.scheduleInterview({
        applicationId: appId,
        title,
        startsAt,
        durationMin,
        mode,
        location
      });

      showToast('Interview successfully scheduled!', 'success');
      closeModal('schedule-interview-modal');
      await loadData();
      if (activeAppIdInDrawer) openCandidateDrawer(activeAppIdInDrawer);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(saveBtn, false);
    }
  };
}

})();

/* js/pages/hr-candidates.page.js */
;(() => {
/**
 * HireFlow HR Candidate Directory Controller (hr-candidates.page.js)
 */


let allCandidates = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

HF.onReady('/hr/candidates.html', async () => {
  const session = guardPage(['hr', 'admin']);
  if (!session) return;

  setupFilters();
  await loadCandidates();
});

function setupFilters() {
  const searchInput = document.getElementById('candidate-search-input');
  const skillSelect = document.getElementById('candidate-skill-select');

  const onFilter = () => {
    currentPage = 1;
    renderCandidatesTable();
  };

  searchInput.addEventListener('input', onFilter);
  skillSelect.addEventListener('change', onFilter);
}

async function loadCandidates() {
  const tbody = document.getElementById('candidates-table-body');
  renderSkeleton(tbody, 'row', 5);

  try {
    allCandidates = await api.getCandidates();
    renderCandidatesTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="padding: 2rem;">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function getFilteredCandidates() {
  const search = document.getElementById('candidate-search-input').value.trim().toLowerCase();
  const skill = document.getElementById('candidate-skill-select').value;

  return allCandidates.filter(c => {
    if (skill && (!c.skills || !c.skills.includes(skill))) return false;
    if (search) {
      const matchName = c.name.toLowerCase().includes(search);
      const matchHeadline = c.headline && c.headline.toLowerCase().includes(search);
      const matchSkills = c.skills && c.skills.some(s => s.toLowerCase().includes(search));
      if (!matchName && !matchHeadline && !matchSkills) return false;
    }
    return true;
  });
}

function renderCandidatesTable() {
  const tbody = document.getElementById('candidates-table-body');
  const pagination = document.getElementById('candidates-pagination');
  const filtered = getFilteredCandidates();

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 3rem;">No candidates found matching criteria.</td></tr>`;
    pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

  tbody.innerHTML = pageItems.map(c => `
    <tr>
      <td data-label="Candidate">
        <div class="flex items-center gap-2">
          ${renderAvatar(c.name, 'sm')}
          <div>
            <div class="font-bold text-sm">${escapeHTML(c.name)}</div>
            <div class="text-xs text-muted">${escapeHTML(c.email)}</div>
          </div>
        </div>
      </td>
      <td data-label="Headline">${escapeHTML(c.headline || 'Candidate')}</td>
      <td data-label="Location">${escapeHTML(c.location || 'Remote')}</td>
      <td data-label="Top Skills">
        <div class="flex gap-1" style="flex-wrap: wrap;">
          ${(c.skills || []).slice(0, 3).map(s => `<span class="badge badge-default" style="font-size: 11px;">${escapeHTML(s)}</span>`).join('')}
          ${c.skills && c.skills.length > 3 ? `<span class="badge badge-default">+${c.skills.length - 3}</span>` : ''}
        </div>
      </td>
      <td data-label="Active Apps">
        <span class="badge badge-${c.activeApplications > 0 ? 'primary' : 'default'}">
          ${c.activeApplications} active
        </span>
      </td>
      <td data-label="Action" style="text-align: right;">
        <button type="button" class="btn btn-secondary btn-sm" data-action="view-profile" data-id="${escapeHTML(c.id)}">
          View Profile
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-action="view-profile"]').forEach(btn => {
    btn.onclick = () => openProfileDrawer(btn.getAttribute('data-id'));
  });

  // Pagination
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button type="button" class="page-btn ${i === currentPage ? 'active' : ''}" data-p="${i}">${i}</button>`;
  }
  pagination.innerHTML = html;
  pagination.querySelectorAll('[data-p]').forEach(btn => {
    btn.onclick = () => {
      currentPage = Number(btn.getAttribute('data-p'));
      renderCandidatesTable();
    };
  });
}

async function openProfileDrawer(userId) {
  const drawerContent = document.getElementById('drawer-profile-content');
  const drawerTitle = document.getElementById('drawer-profile-name');
  drawerContent.innerHTML = `<div class="skeleton" style="height: 250px;"></div>`;
  openDrawer('candidate-profile-drawer');

  try {
    const candidate = await api.getCandidateProfile(userId);
    const candidateApps = await api.getApplications({ candidateId: userId });

    drawerTitle.textContent = candidate.name;

    drawerContent.innerHTML = `
      <div style="border-bottom: 1px solid var(--border); padding-bottom: var(--space-4); margin-bottom: var(--space-4);">
        <div class="flex items-center gap-3" style="margin-bottom: var(--space-3);">
          ${renderAvatar(candidate.name, 'lg')}
          <div>
            <h2 style="font-size: var(--font-size-md); margin-bottom: 2px;">${escapeHTML(candidate.name)}</h2>
            <div class="text-xs text-muted">${escapeHTML(candidate.headline || 'Talent Profile')}</div>
          </div>
        </div>
        <div class="text-xs text-muted" style="display: flex; flex-direction: column; gap: 4px;">
          <span>📧 ${escapeHTML(candidate.email)}</span>
          <span>📞 ${escapeHTML(candidate.phone || 'N/A')}</span>
          <span>📍 ${escapeHTML(candidate.location || 'Remote')}</span>
          ${candidate.linkedin ? `<span>🔗 <a href="${escapeHTML(candidate.linkedin)}" target="_blank" rel="noopener">LinkedIn Profile</a></span>` : ''}
        </div>
      </div>

      <div style="margin-bottom: var(--space-4);">
        <div class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: 6px;">Skills & Competencies</div>
        <div class="flex gap-2" style="flex-wrap: wrap;">
          ${(candidate.skills || []).map(s => `<span class="badge badge-primary">${escapeHTML(s)}</span>`).join('')}
        </div>
      </div>

      <div style="margin-bottom: var(--space-4);">
        <div class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: 4px;">Education & Background</div>
        <p class="text-sm" style="margin: 0;">${escapeHTML(candidate.education || 'Computer Science / Engineering background')}</p>
        <div class="text-xs text-muted" style="margin-top: 2px;">Experience: ${candidate.experienceYears || 0} years</div>
      </div>

      <div style="margin-bottom: var(--space-4); border: 1px solid var(--border); padding: var(--space-3); border-radius: var(--radius-md);">
        <div class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: 4px;">Attached Resume</div>
        <div class="font-bold text-sm">${escapeHTML(candidate.resumeMeta?.fileName || 'Verified_Resume.pdf')}</div>
        <div class="text-xs text-muted">${candidate.resumeMeta?.sizeBytes ? `${(candidate.resumeMeta.sizeBytes / 1024).toFixed(0)} KB • Uploaded ${formatDate(candidate.resumeMeta.uploadedAt)}` : 'Document on file'}</div>
      </div>

      <div>
        <div class="text-xs font-bold text-muted" style="text-transform: uppercase; margin-bottom: 6px;">Candidate Applications (${candidateApps.length})</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${candidateApps.map(a => `
            <div style="background: var(--surface-2); padding: 8px 12px; border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div class="font-bold text-xs">${escapeHTML(a.jobTitle)}</div>
                <div class="text-xs text-muted">Applied ${formatDate(a.appliedAt)}</div>
              </div>
              <span class="badge badge-stage-${a.stage.toLowerCase()}">${escapeHTML(a.stage)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    drawerContent.innerHTML = `<div class="error-state"><p>${escapeHTML(err.message)}</p></div>`;
  }
}

})();

/* js/pages/hr-interviews.page.js */
;(() => {
/**
 * HireFlow HR Interviews Controller (hr-interviews.page.js)
 */


let calendar = null;
let allInterviews = [];
let allApplications = [];
let activeInterviewInDrawer = null;

HF.onReady('/hr/interviews.html', async () => {
  const session = guardPage(['hr', 'admin']);
  if (!session) return;

  setupModalHandlers();
  await loadInterviews();
});

async function loadInterviews() {
  try {
    const [interviews, apps] = await Promise.all([
      api.getInterviews(),
      api.getApplications()
    ]);
    allInterviews = interviews;
    allApplications = apps;

    populateApplicantSelect();

    const mount = document.getElementById('calendar-view-mount');
    if (!calendar) {
      calendar = new InterviewCalendar(mount, {
        events: allInterviews,
        defaultView: 'month',
        onEventClick: (ev) => openInterviewDetails(ev)
      });
    } else {
      calendar.setEvents(allInterviews);
    }
  } catch (err) {
    showToast(`Error loading interviews: ${err.message}`, 'error');
  }
}

function populateApplicantSelect() {
  const select = document.getElementById('int-app-select');
  select.innerHTML = `<option value="">Select an active applicant...</option>`;

  // Filter applications that are not rejected or withdrawn
  const activeApps = allApplications.filter(a => !['Rejected', 'Withdrawn'].includes(a.stage));
  activeApps.forEach(app => {
    const opt = document.createElement('option');
    opt.value = app.id;
    opt.textContent = `${app.candidateName} — ${app.jobTitle} (${app.stage})`;
    select.appendChild(opt);
  });
}

function setupModalHandlers() {
  const openBtn = document.getElementById('btn-open-schedule-modal');
  const form = document.getElementById('schedule-form');
  const submitBtn = document.getElementById('btn-submit-interview');

  openBtn.onclick = () => {
    form.reset();
    document.getElementById('interview-edit-id').value = '';
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    document.getElementById('int-date').value = formatDateInput(tomorrow);
    openModal('schedule-modal');
  };

  form.onsubmit = async (e) => {
    e.preventDefault();

    const appId = document.getElementById('int-app-select').value;
    const title = document.getElementById('int-title').value.trim();
    const date = document.getElementById('int-date').value;
    const time = document.getElementById('int-time').value;
    const durationMin = Number(document.getElementById('int-duration').value);
    const mode = document.getElementById('int-mode').value;
    const location = document.getElementById('int-location').value.trim();

    const participants = Array.from(document.querySelectorAll('input[name="int-participant"]:checked')).map(cb => cb.value);

    if (!appId) {
      showToast('Please select a candidate application', 'error');
      return;
    }
    if (!date || !time) {
      showToast('Please choose date and time', 'error');
      return;
    }

    const startsAt = new Date(`${date}T${time}`).toISOString();
    if (new Date(startsAt).getTime() <= Date.now()) {
      showToast('Interview must be scheduled in the future', 'error');
      return;
    }

    setLoading(submitBtn, true);

    try {
      await api.scheduleInterview({
        applicationId: appId,
        title,
        startsAt,
        durationMin,
        mode,
        location,
        participants
      });

      showToast('Interview scheduled successfully!', 'success');
      closeModal('schedule-modal');
      await loadInterviews();
    } catch (err) {
      showToast(err.message, 'error', 5000);
    } finally {
      setLoading(submitBtn, false);
    }
  };
}

function openInterviewDetails(ev) {
  activeInterviewInDrawer = ev;
  const drawerTitle = document.getElementById('drawer-int-title');
  const content = document.getElementById('drawer-int-content');

  drawerTitle.textContent = ev.title;
  openDrawer('interview-detail-drawer');

  const hasFeedback = ev.feedback && ev.feedback.length > 0;

  content.innerHTML = `
    <div style="border-bottom: 1px solid var(--border); padding-bottom: var(--space-4); margin-bottom: var(--space-4);">
      <div class="flex justify-between items-center" style="margin-bottom: var(--space-2);">
        <span class="badge badge-primary">${escapeHTML(ev.mode)}</span>
        <span class="badge badge-${ev.status === 'completed' ? 'success' : (ev.status === 'cancelled' ? 'danger' : 'default')}">
          ${escapeHTML(ev.status)}
        </span>
      </div>
      <div class="font-bold text-sm" style="margin-bottom: 2px;">${escapeHTML(ev.candidateName || 'Candidate')}</div>
      <div class="text-xs text-muted" style="margin-bottom: var(--space-3);">${escapeHTML(ev.jobTitle || 'Job')}</div>
      <div class="text-xs text-muted">
        📅 <strong>${formatDate(ev.startsAt)}</strong> at <strong>${formatTime(ev.startsAt)}</strong> (${ev.durationMin} mins)
      </div>
      <div class="text-xs text-muted" style="margin-top: 4px;">
        📍 ${ev.location && ev.location.startsWith('http') ? `<a href="${escapeHTML(ev.location)}" target="_blank" rel="noopener">Join Link: ${escapeHTML(ev.location)}</a>` : escapeHTML(ev.location || 'Online')}
      </div>
    </div>

    <!-- Quick Status Change Actions -->
    <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-6); flex-wrap: wrap;">
      ${ev.status === 'scheduled' ? `
        <button type="button" class="btn btn-success btn-sm" id="btn-mark-completed">✓ Mark Completed</button>
        <button type="button" class="btn btn-danger-ghost btn-sm" id="btn-mark-cancelled">✕ Cancel Interview</button>
      ` : ''}
    </div>

    <!-- Existing Feedback Section -->
    ${hasFeedback ? `
      <div style="margin-bottom: var(--space-6);">
        <h4 style="font-size: var(--font-size-sm); margin-bottom: var(--space-3);">Evaluation Feedback</h4>
        ${ev.feedback.map(fb => `
          <div style="background: var(--surface-2); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-2);">
            <div class="flex justify-between items-center" style="margin-bottom: 4px;">
              <span class="badge badge-success">${escapeHTML(fb.recommendation)}</span>
              <span style="color: var(--warning); font-size: 13px;">${'★'.repeat(fb.rating)}</span>
            </div>
            <p class="text-sm" style="margin: 0; color: var(--text);">${escapeHTML(fb.comments)}</p>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Submit Feedback Form (if completed or scheduled) -->
    ${ev.status === 'completed' && !hasFeedback ? `
      <div style="border-top: 1px solid var(--border); padding-top: var(--space-4);">
        <h4 style="font-size: var(--font-size-sm); margin-bottom: var(--space-3);">Submit Candidate Evaluation</h4>
        <form id="evaluation-form">
          <div class="form-group">
            <label class="form-label" for="fb-rating">Rating (1 to 5 Stars)</label>
            <select id="fb-rating" class="form-select">
              <option value="5">★★★★★ - Exceptional (5)</option>
              <option value="4" selected>★★★★☆ - Strong (4)</option>
              <option value="3">★★★☆☆ - Average (3)</option>
              <option value="2">★★☆☆☆ - Below Bar (2)</option>
              <option value="1">★☆☆☆☆ - Reject (1)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="fb-recommendation">Recommendation</label>
            <select id="fb-recommendation" class="form-select">
              <option value="Strong yes">Strong Yes</option>
              <option value="Yes" selected>Yes</option>
              <option value="No">No</option>
              <option value="Strong no">Strong No</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="fb-comments">Evaluation Notes</label>
            <textarea id="fb-comments" class="form-control" placeholder="Provide notes on technical architecture, coding problem solving, and cultural alignment..." required></textarea>
          </div>

          <button type="submit" class="btn btn-primary btn-sm w-full">Save Feedback</button>
        </form>
      </div>
    ` : ''}
  `;

  // Attach button actions
  const completedBtn = document.getElementById('btn-mark-completed');
  if (completedBtn) {
    completedBtn.onclick = async () => {
      await api.updateInterviewStatus(ev.id, 'completed');
      showToast('Interview marked as completed. You can now submit evaluation feedback.', 'success');
      await loadInterviews();
      const updated = allInterviews.find(i => i.id === ev.id);
      if (updated) openInterviewDetails(updated);
    };
  }

  const cancelledBtn = document.getElementById('btn-mark-cancelled');
  if (cancelledBtn) {
    cancelledBtn.onclick = async () => {
      const confirmed = await confirmDialog({
        title: 'Cancel Interview',
        message: 'Are you sure you want to cancel this interview session? The candidate and participants will be notified.',
        confirmText: 'Cancel Session',
        danger: true
      });
      if (confirmed) {
        await api.updateInterviewStatus(ev.id, 'cancelled');
        showToast('Interview cancelled.', 'info');
        await loadInterviews();
        closeDrawer('interview-detail-drawer');
      }
    };
  }

  const fbForm = document.getElementById('evaluation-form');
  if (fbForm) {
    fbForm.onsubmit = async (e) => {
      e.preventDefault();
      const rating = document.getElementById('fb-rating').value;
      const recommendation = document.getElementById('fb-recommendation').value;
      const comments = document.getElementById('fb-comments').value.trim();

      if (!comments) {
        showToast('Please enter evaluation comments', 'error');
        return;
      }

      await api.submitInterviewFeedback({
        interviewId: ev.id,
        rating,
        recommendation,
        comments
      });

      showToast('Interview evaluation saved!', 'success');
      await loadInterviews();
      const updated = allInterviews.find(i => i.id === ev.id);
      if (updated) openInterviewDetails(updated);
    };
  }
}

})();

/* js/pages/hr-offers.page.js */
;(() => {
/**
 * HireFlow HR Offers & Onboarding Controller (hr-offers.page.js)
 */


let allOffers = [];
let allApplications = [];
let offerTemplate = null;

HF.onReady('/hr/offers.html', async () => {
  const session = guardPage(['hr', 'admin']);
  if (!session) return;

  setupTabs();
  setupOfferModal();
  await loadData();

  // If URL has ?appId=, auto-open offer modal
  const params = new URLSearchParams(HF.location.search);
  const targetAppId = params.get('appId');
  if (targetAppId) {
    setTimeout(() => {
      document.getElementById('btn-create-offer').click();
      document.getElementById('offer-app-select').value = targetAppId;
      document.getElementById('offer-app-select').dispatchEvent(new Event('change'));
    }, 300);
  }
});

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.onclick = () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.getAttribute('data-tab'));
      if (targetPanel) targetPanel.classList.add('active');
    };
  });
}

async function loadData() {
  const tbody = document.getElementById('offers-table-body');
  renderSkeleton(tbody, 'row', 4);

  try {
    const [offers, apps, templates] = await Promise.all([
      api.getOffers(),
      api.getApplications(),
      api.getOfferTemplates()
    ]);
    allOffers = offers;
    allApplications = apps;
    offerTemplate = templates[0] || null;

    if (offerTemplate) {
      document.getElementById('template-body-preview').textContent = offerTemplate.body;
    }

    populateOfferAppSelect();
    renderOffersTable();
    renderOnboardingChecklists();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger" style="padding: 2rem;">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function populateOfferAppSelect() {
  const select = document.getElementById('offer-app-select');
  select.innerHTML = `<option value="">Select candidate application...</option>`;

  // Filter applications that are Selected, Interview or without existing offer
  const eligible = allApplications.filter(a => !['Rejected', 'Withdrawn'].includes(a.stage));
  eligible.forEach(app => {
    const opt = document.createElement('option');
    opt.value = app.id;
    opt.textContent = `${app.candidateName} — ${app.jobTitle} (${app.stage})`;
    select.appendChild(opt);
  });
}

function renderOffersTable() {
  const tbody = document.getElementById('offers-table-body');
  if (allOffers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 3rem;">No offers generated yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = allOffers.map(offer => {
    const isAccepted = offer.status === 'accepted';

    return `
      <tr>
        <td data-label="Candidate">
          <div class="font-bold text-sm">${escapeHTML(offer.candidateName)}</div>
        </td>
        <td data-label="Position">${escapeHTML(offer.jobTitle)}</td>
        <td data-label="Annual Salary" class="font-bold text-success">$${offer.salary.toLocaleString()}</td>
        <td data-label="Start Date">${formatDate(offer.startDate)}</td>
        <td data-label="Status">
          <span class="badge badge-${offer.status === 'accepted' ? 'success' : (offer.status === 'declined' ? 'danger' : 'warning')}">
            ${escapeHTML(offer.status)}
          </span>
        </td>
        <td data-label="Issued Date">${offer.issuedAt ? formatDate(offer.issuedAt) : 'Draft'}</td>
        <td data-label="Action" style="text-align: right;">
          <button type="button" class="btn btn-secondary btn-sm" data-action="view-letter" data-id="${escapeHTML(offer.id)}">
            View & Print PDF
          </button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-action="view-letter"]').forEach(btn => {
    btn.onclick = () => openPrintOfferModal(btn.getAttribute('data-id'));
  });
}

function renderOnboardingChecklists() {
  const container = document.getElementById('onboarding-cards-container');
  const acceptedOffers = allOffers.filter(o => o.status === 'accepted');

  if (acceptedOffers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No Active Onboardings</div>
        <p class="empty-state-text">When a candidate accepts an offer, their automated onboarding task checklist will appear here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = acceptedOffers.map(offer => {
    const tasks = offer.tasks || [];
    const completedCount = tasks.filter(t => t.done).length;
    const progressPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

    return `
      <div class="card" style="border-left: 4px solid var(--success);">
        <div class="flex justify-between items-center" style="margin-bottom: var(--space-4); flex-wrap: wrap; gap: var(--space-2);">
          <div>
            <span class="badge badge-success" style="margin-bottom: 4px;">Offer Accepted</span>
            <h3 style="font-size: var(--font-size-md); margin-bottom: 2px;">${escapeHTML(offer.candidateName)} — ${escapeHTML(offer.jobTitle)}</h3>
            <span class="text-xs text-muted">Target Start Date: <strong>${formatDate(offer.startDate)}</strong></span>
          </div>
          <div style="text-align: right;">
            <div class="text-xs font-bold text-muted">Onboarding Progress: ${completedCount} / ${tasks.length} tasks</div>
            <div style="background: var(--surface-2); width: 140px; height: 8px; border-radius: 4px; overflow: hidden; margin-top: 4px;">
              <div style="background: var(--success); width: ${progressPct}%; height: 100%;"></div>
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4);">
          ${tasks.map(task => `
            <label class="form-check" style="background: var(--surface-2); padding: 8px 12px; border-radius: var(--radius-sm); margin: 0; align-items: center;">
              <input type="checkbox" class="form-check-input" data-task-id="${escapeHTML(task.id)}" ${task.done ? 'checked' : ''}>
              <span class="form-check-label text-sm" style="${task.done ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">
                ${escapeHTML(task.title)} <small class="text-muted">(${escapeHTML(task.owner.toUpperCase())} • Due: ${formatDate(task.dueDate)})</small>
              </span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Attach task toggle checkboxes
  container.querySelectorAll('input[data-task-id]').forEach(cb => {
    cb.onchange = async () => {
      const taskId = cb.getAttribute('data-task-id');
      await api.toggleOnboardingTask(taskId, cb.checked);
      showToast('Onboarding task updated', 'info');
      await loadData();
    };
  });
}

function setupOfferModal() {
  const modal = document.getElementById('offer-modal');
  const createBtn = document.getElementById('btn-create-offer');
  const appSelect = document.getElementById('offer-app-select');
  const salaryInput = document.getElementById('offer-salary-input');
  const dateInput = document.getElementById('offer-start-date');
  const preview = document.getElementById('offer-live-preview');
  const form = document.getElementById('offer-form');
  const submitBtn = document.getElementById('btn-submit-offer');

  createBtn.onclick = () => {
    form.reset();
    const inTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    dateInput.value = formatDateInput(inTwoWeeks);
    salaryInput.value = 130000;
    updateOfferPreview();
    openModal('offer-modal');
  };

  const updateOfferPreview = () => {
    const appId = appSelect.value;
    const salary = Number(salaryInput.value) || 0;
    const startDate = dateInput.value;

    if (!appId || !offerTemplate) {
      preview.textContent = 'Select a candidate application to render preview.';
      return;
    }

    const app = allApplications.find(a => a.id === appId);
    if (!app) return;

    const rendered = offerTemplate.body
      .replace('{{candidate_name}}', app.candidateName)
      .replace(/{{job_title}}/g, app.jobTitle)
      .replace(/{{company_name}}/g, 'Acme Innovations')
      .replace('{{salary}}', salary.toLocaleString())
      .replace('{{start_date}}', startDate || 'TBD')
      .replace('{{hr_name}}', 'Elena Rostova');

    preview.textContent = rendered;
  };

  appSelect.onchange = updateOfferPreview;
  salaryInput.oninput = updateOfferPreview;
  dateInput.onchange = updateOfferPreview;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const appId = appSelect.value;
    const salary = Number(salaryInput.value);
    const startDate = dateInput.value;
    const status = document.getElementById('offer-status-select').value;

    if (!appId) {
      showToast('Please select candidate application', 'error');
      return;
    }
    if (!salary || salary <= 0) {
      showToast('Please provide a valid annual salary', 'error');
      return;
    }
    if (!startDate) {
      showToast('Please specify a start date', 'error');
      return;
    }

    const app = allApplications.find(a => a.id === appId);
    const renderedBody = offerTemplate.body
      .replace('{{candidate_name}}', app ? app.candidateName : 'Candidate')
      .replace(/{{job_title}}/g, app ? app.jobTitle : 'Role')
      .replace(/{{company_name}}/g, 'Acme Innovations')
      .replace('{{salary}}', salary.toLocaleString())
      .replace('{{start_date}}', startDate)
      .replace('{{hr_name}}', 'Elena Rostova');

    setLoading(submitBtn, true);

    try {
      await api.createOffer({
        applicationId: appId,
        templateId: offerTemplate.id,
        salary,
        startDate: new Date(startDate).toISOString(),
        status,
        renderedBody
      });

      showToast('Job offer created successfully!', 'success');
      closeModal('offer-modal');
      await loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(submitBtn, false);
    }
  };

  document.getElementById('btn-print-doc').onclick = () => {
    window.print();
  };
}

function openPrintOfferModal(offerId) {
  const offer = allOffers.find(o => o.id === offerId);
  if (!offer) return;

  const bodyEl = document.getElementById('print-offer-body');
  bodyEl.innerHTML = `
    <div class="print-letterhead">
      <div>
        <h1 style="font-size: 24px; font-weight: 800; margin: 0; color: #111827;">ACME INNOVATIONS</h1>
        <div style="font-size: 11px; color: #6B7280; margin-top: 2px;">Official Offer of Employment • Confidential</div>
      </div>
      <div style="text-align: right; font-size: 11px; color: #6B7280;">
        <div>Date: ${formatDate(offer.issuedAt || new Date())}</div>
        <div>Ref: ${offer.id.toUpperCase()}</div>
      </div>
    </div>

    <div style="font-size: 14px; line-height: 1.8; color: #1F2937; white-space: pre-line; margin-bottom: 2rem;">
      ${escapeHTML(offer.renderedBody)}
    </div>

    <div class="print-signature-section">
      <div class="signature-block">
        <div style="font-weight: 700; color: #111827; margin-bottom: 2px;">Elena Rostova</div>
        <div>Director of Talent Acquisition, Acme Innovations</div>
      </div>
      <div class="signature-block">
        <div style="font-weight: 700; color: #111827; margin-bottom: 2px;">${escapeHTML(offer.candidateName)}</div>
        <div>Candidate Signature & Acceptance</div>
      </div>
    </div>
  `;

  openModal('print-offer-modal');
}

})();

/* js/pages/hr-analytics.page.js */
;(() => {
/**
 * HireFlow Recruitment Analytics Controller (hr-analytics.page.js)
 */


let allJobs = [];
let allApplications = [];
let allOffers = [];
let allNotifs = [];
let selectedDays = 90; // default 90 days

HF.onReady('/hr/analytics.html', async () => {
  const session = guardPage(['hr', 'admin']);
  if (!session) return;

  setupFilters();
  await loadAnalyticsData();
});

function setupFilters() {
  const rangeBtns = document.querySelectorAll('[data-range]');
  const jobSelect = document.getElementById('analytics-job-select');

  rangeBtns.forEach(btn => {
    btn.onclick = () => {
      rangeBtns.forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-ghost');
      });
      btn.classList.remove('btn-ghost');
      btn.classList.add('btn-primary');

      const val = btn.getAttribute('data-range');
      selectedDays = val === 'all' ? 365 : Number(val);
      calculateAndRender();
    };
  });

  jobSelect.onchange = () => calculateAndRender();
}

async function loadAnalyticsData() {
  try {
    const [jobs, apps, offers, notifs] = await Promise.all([
      api.getJobs(),
      api.getApplications(),
      api.getOffers(),
      api.getNotifications()
    ]);
    allJobs = jobs;
    allApplications = apps;
    allOffers = offers;
    allNotifs = notifs;

    // Populate jobs select
    const jobSelect = document.getElementById('analytics-job-select');
    jobSelect.innerHTML = `<option value="">All Job Openings (${jobs.length})</option>`;
    jobs.forEach(j => {
      const opt = document.createElement('option');
      opt.value = j.id;
      opt.textContent = `${j.title} (${j.department})`;
      jobSelect.appendChild(opt);
    });

    calculateAndRender();
  } catch (err) {
    console.error('Error loading analytics data:', err);
  }
}

function calculateAndRender() {
  const now = new Date();
  const cutoffTime = now.getTime() - selectedDays * 24 * 60 * 60 * 1000;
  const selectedJobId = document.getElementById('analytics-job-select').value;

  // Filter applications by date window and job
  const apps = allApplications.filter(a => {
    const appTime = new Date(a.appliedAt).getTime();
    if (appTime < cutoffTime) return false;
    if (selectedJobId && a.jobId !== selectedJobId) return false;
    return true;
  });

  // 1. Time-to-hire calculation
  let totalTTH = 0;
  let tthCount = 0;
  let excludedCount = 0;

  allOffers.forEach(o => {
    if (o.status === 'accepted' && o.respondedAt) {
      const app = allApplications.find(a => a.id === o.applicationId);
      if (app && (!selectedJobId || app.jobId === selectedJobId)) {
        if (app.appliedAt) {
          const days = Math.round((new Date(o.respondedAt) - new Date(app.appliedAt)) / (1000 * 60 * 60 * 24));
          if (days >= 0 && days <= 180) {
            totalTTH += days;
            tthCount++;
          } else {
            excludedCount++;
          }
        } else {
          excludedCount++;
        }
      }
    }
  });

  const avgTTH = tthCount > 0 ? (totalTTH / tthCount).toFixed(1) : 'N/A';
  document.getElementById('kpi-tth').textContent = avgTTH;
  document.getElementById('stat-excluded-tth').textContent = excludedCount;

  // 2. Offer Acceptance Rate
  const relevantOffers = allOffers.filter(o => {
    const app = allApplications.find(a => a.id === o.applicationId);
    return !selectedJobId || (app && app.jobId === selectedJobId);
  });
  const respondedOffers = relevantOffers.filter(o => ['accepted', 'declined'].includes(o.status));
  const acceptedOffers = relevantOffers.filter(o => o.status === 'accepted');
  const acceptanceRate = respondedOffers.length > 0 
    ? `${Math.round((acceptedOffers.length / respondedOffers.length) * 100)}%` 
    : 'N/A';
  document.getElementById('kpi-offer-acc').textContent = acceptanceRate;

  // 3. Total Apps
  document.getElementById('kpi-total-apps').textContent = apps.length;

  // 4. Mock notification rate
  const totalNotifs = allNotifs.length;
  const sentNotifs = allNotifs.filter(n => n.status === 'sent').length;
  const notifRate = totalNotifs > 0 ? `${Math.round((sentNotifs / totalNotifs) * 100)}%` : 'N/A';
  document.getElementById('kpi-notif-rate').textContent = notifRate;

  // -------------------------------------------------------------
  // Chart 1: Applications Over Time (Line Chart)
  // -------------------------------------------------------------
  const lineData = [];
  const intervals = 6;
  const stepMs = (selectedDays * 24 * 60 * 60 * 1000) / intervals;

  for (let i = 0; i < intervals; i++) {
    const startWindow = new Date(cutoffTime + i * stepMs);
    const endWindow = new Date(cutoffTime + (i + 1) * stepMs);
    const count = apps.filter(a => {
      const t = new Date(a.appliedAt).getTime();
      return t >= startWindow.getTime() && t < endWindow.getTime();
    }).length;

    lineData.push({
      label: formatDate(startWindow, { month: 'numeric', day: 'numeric' }),
      count
    });
  }
  renderLineChart(document.getElementById('chart-area-inflow'), lineData);

  // -------------------------------------------------------------
  // Chart 2: Pipeline Funnel with Conversion %
  // -------------------------------------------------------------
  const funnelStages = ['Applied', 'Screening', 'Interview', 'Selected', 'Offered'];
  const funnelData = funnelStages.map(stage => {
    // Cohort count: candidates who reached at least this stage
    let count = 0;
    if (stage === 'Applied') count = apps.length;
    else if (stage === 'Screening') count = apps.filter(a => ['Screening', 'Interview', 'Selected', 'Offered'].includes(a.stage)).length;
    else if (stage === 'Interview') count = apps.filter(a => ['Interview', 'Selected', 'Offered'].includes(a.stage)).length;
    else if (stage === 'Selected') count = apps.filter(a => ['Selected', 'Offered'].includes(a.stage)).length;
    else if (stage === 'Offered') count = apps.filter(a => a.stage === 'Offered').length;
    return { stage, count };
  });
  renderFunnelChart(document.getElementById('chart-funnel-stages'), funnelData);

  // -------------------------------------------------------------
  // Chart 3: Top Roles by Applications (Horizontal Bars)
  // -------------------------------------------------------------
  const jobCounts = {};
  apps.forEach(a => {
    jobCounts[a.jobTitle] = (jobCounts[a.jobTitle] || 0) + 1;
  });
  const barData = Object.entries(jobCounts)
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count);
  renderHorizontalBarChart(document.getElementById('chart-bar-jobs'), barData);

  // -------------------------------------------------------------
  // Chart 4: Department Breakdown (Donut Chart)
  // -------------------------------------------------------------
  const deptCounts = {};
  apps.forEach(a => {
    const dept = a.jobDepartment || 'Other';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });
  const donutData = Object.entries(deptCounts).map(([label, count]) => ({ label, count }));
  renderDonutChart(document.getElementById('chart-donut-depts'), donutData);
}

})();

/* js/pages/admin-overview.page.js */
;(() => {
/**
 * HireFlow Admin Overview Controller (admin-overview.page.js)
 */


HF.onReady('/admin/overview.html', async () => {
  const session = guardPage(['admin']);
  if (!session) return;

  await loadAdminMetrics();
});

async function loadAdminMetrics() {
  try {
    const [users, jobs, apps, notifs, activity] = await Promise.all([
      api.getUsers(),
      api.getJobs(),
      api.getApplications(),
      api.getNotifications(),
      api.getActivityLog()
    ]);

    // KPI: Users
    document.getElementById('kpi-users-count').textContent = users.length;
    const adminCount = users.filter(u => u.role === 'admin').length;
    const hrCount = users.filter(u => u.role === 'hr').length;
    const candCount = users.filter(u => u.role === 'candidate').length;
    document.getElementById('kpi-users-roles').textContent = `${adminCount} Admin • ${hrCount} HR • ${candCount} Candidate`;

    // KPI: Jobs
    document.getElementById('kpi-active-jobs').textContent = jobs.filter(j => j.status === 'published').length;

    // KPI: Applications
    document.getElementById('kpi-total-apps').textContent = apps.length;

    // KPI: Notification Failures
    const failedNotifs = notifs.filter(n => n.status === 'failed');
    document.getElementById('kpi-failed-notifs').textContent = failedNotifs.length;

    // System Activity Feed
    const feed = document.getElementById('admin-activity-feed');
    if (!activity || activity.length === 0) {
      feed.innerHTML = `<div class="text-sm text-muted">No system activities recorded yet.</div>`;
      return;
    }

    feed.innerHTML = activity.slice(0, 15).map(act => `
      <div class="timeline-item">
        <div class="timeline-point"></div>
        <div class="timeline-title">
          <strong>${escapeHTML(act.action)}</strong> (${escapeHTML(act.entityType)})
        </div>
        <div class="timeline-meta">${relativeTime(act.at)} • Actor: ${escapeHTML(act.actorId)}</div>
        ${act.meta ? `
          <div style="font-family: monospace; font-size: 11px; color: var(--text-muted); background: var(--surface-2); padding: 4px 8px; border-radius: 4px; margin-top: 4px;">
            ${escapeHTML(JSON.stringify(act.meta))}
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading admin overview metrics:', err);
  }
}

})();

/* js/pages/admin-users.page.js */
;(() => {
/**
 * HireFlow Admin Users Controller (admin-users.page.js)
 */


let session = null;
let allUsers = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

HF.onReady('/admin/users.html', async () => {
  session = guardPage(['admin']);
  if (!session) return;

  setupFilters();
  setupInviteModal();
  await loadUsers();
});

function setupFilters() {
  const search = document.getElementById('user-search-input');
  const roleFilter = document.getElementById('user-role-filter');

  const onFilter = () => {
    currentPage = 1;
    renderUsersTable();
  };

  search.addEventListener('input', onFilter);
  roleFilter.addEventListener('change', onFilter);
}

async function loadUsers() {
  const tbody = document.getElementById('users-table-body');
  renderSkeleton(tbody, 'row', 5);

  try {
    allUsers = await api.getUsers();
    renderUsersTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="padding: 2rem;">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function getFilteredUsers() {
  const search = document.getElementById('user-search-input').value.trim().toLowerCase();
  const role = document.getElementById('user-role-filter').value;

  return allUsers.filter(u => {
    if (role && u.role !== role) return false;
    if (search && !u.name.toLowerCase().includes(search) && !u.email.toLowerCase().includes(search)) return false;
    return true;
  });
}

function renderUsersTable() {
  const tbody = document.getElementById('users-table-body');
  const pagination = document.getElementById('users-pagination');
  const filtered = getFilteredUsers();

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 3rem;">No users found matching your filters.</td></tr>`;
    pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

  tbody.innerHTML = pageItems.map(user => {
    const isSelf = user.id === session.userId;

    return `
      <tr>
        <td data-label="User">
          <div class="flex items-center gap-2">
            ${renderAvatar(user.name, 'sm')}
            <div>
              <div class="font-bold text-sm">
                ${escapeHTML(user.name)}
                ${isSelf ? '<span class="badge badge-default" style="font-size: 10px; margin-left: 4px;">You</span>' : ''}
              </div>
              <div class="text-xs text-muted">${escapeHTML(user.email)}</div>
            </div>
          </div>
        </td>
        <td data-label="Role">
          <select class="form-select form-select-sm" data-role-select data-id="${escapeHTML(user.id)}" style="min-height: 32px; width: 130px; font-size: 12px;" ${isSelf ? 'disabled title="You cannot change your own role"' : ''}>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option>
            <option value="hr" ${user.role === 'hr' ? 'selected' : ''}>HR Specialist</option>
            <option value="candidate" ${user.role === 'candidate' ? 'selected' : ''}>Candidate</option>
          </select>
        </td>
        <td data-label="Status">
          <span class="badge badge-${user.active ? 'success' : 'danger'}">
            ${user.active ? 'Active' : 'Deactivated'}
          </span>
        </td>
        <td data-label="Created Date">${formatDate(user.createdAt)}</td>
        <td data-label="Last Login">${user.lastLoginAt ? relativeTime(user.lastLoginAt) : 'Never'}</td>
        <td data-label="Actions" style="text-align: right;">
          <button type="button" class="btn ${user.active ? 'btn-danger-ghost' : 'btn-success'} btn-sm" data-toggle-active data-id="${escapeHTML(user.id)}" data-active="${user.active}" ${isSelf ? 'disabled title="Cannot deactivate yourself"' : ''}>
            ${user.active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach role select change listeners
  tbody.querySelectorAll('[data-role-select]').forEach(sel => {
    sel.onchange = async () => {
      const userId = sel.getAttribute('data-id');
      const newRole = sel.value;
      try {
        await api.updateUserRole(userId, newRole);
        showToast(`User role updated to ${newRole.toUpperCase()}`, 'success');
        await loadUsers();
      } catch (err) {
        showToast(err.message, 'error');
        await loadUsers();
      }
    };
  });

  // Attach activate/deactivate listeners
  tbody.querySelectorAll('[data-toggle-active]').forEach(btn => {
    btn.onclick = async () => {
      const userId = btn.getAttribute('data-id');
      const currentActive = btn.getAttribute('data-active') === 'true';
      const targetActive = !currentActive;

      if (currentActive) {
        const confirmed = await confirmDialog({
          title: 'Deactivate User Account',
          message: 'Deactivating this user will revoke their session and prevent future logins.',
          confirmText: 'Deactivate',
          danger: true
        });
        if (!confirmed) return;
      }

      try {
        await api.toggleUserActive(userId, targetActive);
        showToast(`User ${targetActive ? 'activated' : 'deactivated'}.`, 'info');
        await loadUsers();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });

  // Pagination
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button type="button" class="page-btn ${i === currentPage ? 'active' : ''}" data-p="${i}">${i}</button>`;
  }
  pagination.innerHTML = html;
  pagination.querySelectorAll('[data-p]').forEach(btn => {
    btn.onclick = () => {
      currentPage = Number(btn.getAttribute('data-p'));
      renderUsersTable();
    };
  });
}

function setupInviteModal() {
  const openBtn = document.getElementById('btn-invite-user');
  const form = document.getElementById('invite-form');
  const submitBtn = document.getElementById('btn-submit-invite');

  openBtn.onclick = () => {
    form.reset();
    openModal('invite-modal');
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('invite-name').value.trim();
    const email = document.getElementById('invite-email').value.trim().toLowerCase();
    const role = document.getElementById('invite-role').value;

    const db = storage.get(DB_KEY);
    if (db.users.some(u => u.email.toLowerCase() === email)) {
      showToast('A user with this email already exists', 'error');
      return;
    }

    setLoading(submitBtn, true);

    const newUser = {
      id: `usr_${Date.now()}`,
      name,
      email,
      passwordHash: INITIAL_PASSWORD_HASH,
      role,
      companyId: 'comp_1',
      active: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: null
    };

    db.users.push(newUser);

    // Mock notification email
    db.notifications.push({
      id: `notif_${Date.now()}`,
      type: 'invitation',
      toUserId: newUser.id,
      subject: `Welcome to HireFlow ATS - Acme Innovations`,
      body: `Hello ${name}, you have been invited as a ${role.toUpperCase()} on HireFlow. Your temporary password is: Demo@1234`,
      status: 'sent',
      attempts: 1,
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString()
    });

    storage.set(DB_KEY, db);

    showToast(`Invitation sent to ${email}!`, 'success');
    closeModal('invite-modal');
    setLoading(submitBtn, false);
    await loadUsers();
  };
}

})();

/* js/pages/admin-notifications.page.js */
;(() => {
/**
 * HireFlow Admin Notifications Controller (admin-notifications.page.js)
 */


let allNotifs = [];
let allUsers = [];
let activeFilter = 'all';
let currentPage = 1;
const ITEMS_PER_PAGE = 10;

HF.onReady('/admin/notifications.html', async () => {
  const session = guardPage(['admin']);
  if (!session) return;

  setupFilterTabs();
  await loadNotifications();
});

function setupFilterTabs() {
  document.querySelectorAll('[data-status-filter]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('[data-status-filter]').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-ghost');
      });
      btn.classList.remove('btn-ghost');
      btn.classList.add('btn-primary');

      activeFilter = btn.getAttribute('data-status-filter');
      currentPage = 1;
      renderTable();
    };
  });
}

async function loadNotifications() {
  const tbody = document.getElementById('notifications-table-body');
  renderSkeleton(tbody, 'row', 5);

  try {
    const [notifs, users] = await Promise.all([
      api.getNotifications(),
      api.getUsers()
    ]);
    allNotifs = notifs.reverse(); // newest first
    allUsers = users;

    const failed = allNotifs.filter(n => n.status === 'failed');
    const sent = allNotifs.filter(n => n.status === 'sent');

    document.getElementById('count-all-notifs').textContent = allNotifs.length;
    document.getElementById('count-failed-notifs').textContent = failed.length;
    document.getElementById('count-sent-notifs').textContent = sent.length;

    renderTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger" style="padding: 2rem;">Error: ${escapeHTML(err.message)}</td></tr>`;
  }
}

function getFilteredNotifs() {
  if (activeFilter === 'failed') {
    return allNotifs.filter(n => n.status === 'failed');
  }
  if (activeFilter === 'sent') {
    return allNotifs.filter(n => n.status === 'sent');
  }
  return allNotifs;
}

function renderTable() {
  const tbody = document.getElementById('notifications-table-body');
  const pagination = document.getElementById('notifications-pagination');
  const filtered = getFilteredNotifs();

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 3rem;">No notifications in this filter view.</td></tr>`;
    pagination.innerHTML = '';
    return;
  }

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

  tbody.innerHTML = pageItems.map(notif => {
    const user = allUsers.find(u => u.id === notif.toUserId);
    const recipientText = user ? `${user.name} (${user.email})` : notif.toUserId;
    const isFailed = notif.status === 'failed';

    return `
      <tr>
        <td data-label="Recipient">
          <div class="font-bold text-sm">${escapeHTML(recipientText)}</div>
        </td>
        <td data-label="Subject">
          <span class="text-sm font-semibold">${escapeHTML(notif.subject)}</span>
        </td>
        <td data-label="Status">
          <span class="badge badge-${isFailed ? 'danger' : 'success'}">
            ${escapeHTML(notif.status)}
          </span>
        </td>
        <td data-label="Attempts">${notif.attempts || 1} / 3</td>
        <td data-label="Created Date">${relativeTime(notif.createdAt)}</td>
        <td data-label="Action" style="text-align: right;">
          <div class="flex gap-2 justify-end" style="justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" data-action="view" data-id="${escapeHTML(notif.id)}">
              View Body
            </button>
            ${isFailed ? `
              <button type="button" class="btn btn-primary btn-sm" data-action="retry" data-id="${escapeHTML(notif.id)}">
                Retry Delivery
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach button events
  tbody.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.onclick = () => {
      const notif = allNotifs.find(n => n.id === btn.getAttribute('data-id'));
      if (notif) openNotifModal(notif);
    };
  });

  tbody.querySelectorAll('[data-action="retry"]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.getAttribute('data-id');
      try {
        await api.retryNotification(id);
        showToast('Simulated email retry succeeded! Marked as delivered.', 'success');
        await loadNotifications();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });

  // Pagination
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button type="button" class="page-btn ${i === currentPage ? 'active' : ''}" data-p="${i}">${i}</button>`;
  }
  pagination.innerHTML = html;
  pagination.querySelectorAll('[data-p]').forEach(btn => {
    btn.onclick = () => {
      currentPage = Number(btn.getAttribute('data-p'));
      renderTable();
    };
  });
}

function openNotifModal(notif) {
  const user = allUsers.find(u => u.id === notif.toUserId);
  const recipient = user ? `${user.name} <${user.email}>` : notif.toUserId;

  document.getElementById('modal-notif-sub').textContent = notif.subject;
  document.getElementById('view-notif-to').textContent = recipient;
  document.getElementById('view-notif-status').innerHTML = `<span class="badge badge-${notif.status === 'sent' ? 'success' : 'danger'}">${escapeHTML(notif.status)}</span> (Attempts: ${notif.attempts || 1})`;
  document.getElementById('view-notif-date').textContent = formatDateTime(notif.sentAt || notif.createdAt);
  document.getElementById('view-notif-body').textContent = notif.body;

  openModal('notif-modal');
}

})();

/* js/pages/admin-settings.page.js */
;(() => {
/**
 * HireFlow Admin Settings Controller (admin-settings.page.js)
 */


let db = null;

HF.onReady('/admin/settings.html', () => {
  const session = guardPage(['admin']);
  if (!session) return;

  loadSettings();
  setupCompanyForm();
  setupTemplateForm();
  setupDataButtons();
});

function loadSettings() {
  db = storage.get(DB_KEY);
  if (!db) return;

  const comp = db.companies[0] || {};
  document.getElementById('comp-name').value = comp.name || '';
  document.getElementById('comp-industry').value = comp.industry || '';
  document.getElementById('comp-website').value = comp.website || '';

  const tmpl = db.offerTemplates[0] || {};
  document.getElementById('template-body-input').value = tmpl.body || '';
}

function setupCompanyForm() {
  const form = document.getElementById('company-profile-form');
  const btn = document.getElementById('btn-save-company');

  form.onsubmit = (e) => {
    e.preventDefault();
    setLoading(btn, true);

    const name = document.getElementById('comp-name').value.trim();
    const industry = document.getElementById('comp-industry').value.trim();
    const website = document.getElementById('comp-website').value.trim();

    if (!name) {
      showToast('Company name is required', 'error');
      setLoading(btn, false);
      return;
    }

    db = storage.get(DB_KEY);
    if (!db.companies[0]) {
      db.companies[0] = { id: 'comp_1' };
    }
    db.companies[0].name = name;
    db.companies[0].industry = industry;
    db.companies[0].website = website;

    storage.set(DB_KEY, db);
    setLoading(btn, false);
    showToast('Organization profile saved!', 'success');
  };
}

function setupTemplateForm() {
  const form = document.getElementById('template-editor-form');
  const btn = document.getElementById('btn-save-template');

  form.onsubmit = (e) => {
    e.preventDefault();
    setLoading(btn, true);

    const body = document.getElementById('template-body-input').value.trim();
    if (!body) {
      showToast('Template body cannot be empty', 'error');
      setLoading(btn, false);
      return;
    }

    db = storage.get(DB_KEY);
    if (!db.offerTemplates[0]) {
      db.offerTemplates[0] = { id: 'tmpl_standard', name: 'Standard Full-Time Offer' };
    }
    db.offerTemplates[0].body = body;

    storage.set(DB_KEY, db);
    setLoading(btn, false);
    showToast('Offer letter template updated!', 'success');
  };
}

function setupDataButtons() {
  // Export JSON Database
  document.getElementById('btn-export-json').onclick = () => {
    db = storage.get(DB_KEY);
    const jsonStr = JSON.stringify(db, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hireflow_db_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('JSON database export downloaded!', 'success');
  };

  // Reset Demo Data
  document.getElementById('btn-reset-data').onclick = async () => {
    const confirmed = await confirmDialog({
      title: 'Reset Demo Data to Initial Seed',
      message: 'Are you sure? This will overwrite any new jobs, mock interviews, or applications created and restore the original 70 applications and seed profiles.',
      confirmText: 'Reset Demo Database',
      danger: true
    });

    if (confirmed) {
      resetDemoData();
      showToast('Demo data restored to initial seed. Reloading...', 'success', 2000);
      setTimeout(() => {
        HF.reload();
      }, 700);
    }
  };
}

})();

HF.onReady('/403.html', () => { initDemoBanner(); setupThemeToggle(); });
HF.onReady('/404.html', () => { initDemoBanner(); setupThemeToggle(); });
HF.start();

  