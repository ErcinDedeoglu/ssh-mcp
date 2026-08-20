export declare function sanitizeError(error: unknown): string;
export declare function sanitizePath(path: string): string;
export declare const DEFAULT_MAX_OUTPUT_LENGTH = 10000;
export interface TruncationResult {
    text: string;
    truncated: boolean;
    originalLength: number;
}
export declare function truncateOutput(output: string, maxLength: number): TruncationResult;
//# sourceMappingURL=sanitize.d.ts.map