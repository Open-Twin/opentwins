// Typed errors. Server maps these to HTTP status codes.

export class ImageCoreError extends Error {
  constructor(message, { code, status, detail } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code || this.constructor.name;
    this.status = status || 500;
    if (detail) this.detail = detail;
  }
  toJSON() {
    return { error: this.message, code: this.code, ...(this.detail ? { detail: this.detail } : {}) };
  }
}

export class InvalidRouteError extends ImageCoreError {
  constructor(message, detail) { super(message, { code: 'invalid_route', status: 400, detail }); }
}

export class InvalidDataError extends ImageCoreError {
  constructor(message, detail) { super(message, { code: 'invalid_data', status: 422, detail }); }
}

export class RenderError extends ImageCoreError {
  constructor(message, detail) { super(message, { code: 'render_failed', status: 500, detail }); }
}

export class ChromeNotFoundError extends ImageCoreError {
  constructor(message, detail) { super(message, { code: 'chrome_not_found', status: 503, detail }); }
}

export class QueueFullError extends ImageCoreError {
  constructor(message, detail) { super(message, { code: 'queue_full', status: 429, detail }); }
}

export class TemplateNotFoundError extends ImageCoreError {
  constructor(message, detail) { super(message, { code: 'template_not_found', status: 500, detail }); }
}
