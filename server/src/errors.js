export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

export class ValidationError extends HttpError {
  constructor(fields, message = 'Please check the highlighted fields.') {
    super(400, 'VALIDATION_ERROR', message, { fields });
    this.name = 'ValidationError';
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found.`);
