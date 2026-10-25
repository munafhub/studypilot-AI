import { ValidationError } from '../errors.js';
import { isValidDate, WEEKDAYS } from './dates.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Small field validator that collects every error and throws once. */
export class Fields {
  constructor(input) {
    this.input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    this.errors = {};
    this.bodyOk = input && typeof input === 'object' && !Array.isArray(input);
    if (!this.bodyOk) this.errors._body = 'A JSON object is required.';
  }
  has(key) {
    return this.input[key] !== undefined;
  }
  str(key, { min = 0, max = 500, optional = false, label = key } = {}) {
    const v = this.input[key];
    if (v === undefined || v === null) {
      if (!optional) this.errors[key] = `${label} is required.`;
      return undefined;
    }
    if (typeof v !== 'string') {
      this.errors[key] = `${label} must be text.`;
      return undefined;
    }
    const s = v.trim();
    if (s.length < min) this.errors[key] = min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`;
    else if (s.length > max) this.errors[key] = `${label} must be at most ${max} characters.`;
    else return s;
    return undefined;
  }
  int(key, { min, max, optional = false, label = key } = {}) {
    const v = this.input[key];
    if (v === undefined || v === null || v === '') {
      if (!optional) this.errors[key] = `${label} is required.`;
      return undefined;
    }
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (typeof n !== 'number' || !Number.isInteger(n)) {
      this.errors[key] = `${label} must be a whole number.`;
      return undefined;
    }
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
      this.errors[key] = `${label} must be between ${min} and ${max}.`;
      return undefined;
    }
    return n;
  }
  oneOf(key, values, { optional = false, label = key } = {}) {
    const v = this.input[key];
    if (v === undefined || v === null) {
      if (!optional) this.errors[key] = `${label} is required.`;
      return undefined;
    }
    if (!values.includes(v)) {
      this.errors[key] = `${label} must be one of: ${values.join(', ')}.`;
      return undefined;
    }
    return v;
  }
  /** Returns a date string, null (explicit clear) or undefined (absent). */
  date(key, { optional = true, nullable = false, label = key } = {}) {
    const v = this.input[key];
    if (v === undefined) {
      if (!optional) this.errors[key] = `${label} is required.`;
      return undefined;
    }
    if (v === null || v === '') {
      if (nullable || optional) return null;
      this.errors[key] = `${label} is required.`;
      return undefined;
    }
    if (!isValidDate(v)) {
      this.errors[key] = `${label} must be a valid date (YYYY-MM-DD).`;
      return undefined;
    }
    return v;
  }
  email(key = 'email') {
    const s = this.str(key, { min: 1, max: 254, label: 'Email' });
    if (s !== undefined) {
      if (!EMAIL_RE.test(s)) {
        this.errors[key] = 'Enter a valid email address.';
        return undefined;
      }
      return s.toLowerCase();
    }
    return undefined;
  }
  done() {
    if (Object.keys(this.errors).length) throw new ValidationError(this.errors);
  }
}

export function parseAvailability(value, base = {}) {
  const errors = {};
  const out = { ...base };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError({ availability: 'Availability must be an object of minutes per weekday.' });
  }
  for (const [k, v] of Object.entries(value)) {
    if (!WEEKDAYS.includes(k)) errors[k] = 'Unknown weekday.';
    else if (!Number.isInteger(v) || v < 0 || v > 960) errors[k] = 'Minutes must be a whole number from 0 to 960.';
    else out[k] = v;
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

export function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
