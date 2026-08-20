import { sanitizeError } from '../utils/sanitize.js';
export function failureFrom(error) {
    return { ok: false, message: sanitizeError(error) };
}
//# sourceMappingURL=types.js.map