import type { Job } from '../ssh/job-registry.js';
import { stripControlSequences } from '../ssh/shell-session.types.js';
import { failureFrom, type ActionDeps, type ActionOutcome } from './types.js';
import { DEFAULT_MAX_OUTPUT_LENGTH, truncateOutput } from '../utils/sanitize.js';

export interface CheckJobInput {
  jobId: string;
  maxOutputLength?: number;
}

export type CheckJobResult = Record<string, unknown>;

export async function checkJob(
  input: CheckJobInput,
  deps: ActionDeps,
): Promise<ActionOutcome<CheckJobResult>> {
  try {
    const job = resolveJob(input.jobId, deps);

    if (!job) {
      return {
        ok: false,
        message: `Job ${input.jobId} not found`,
        json: { error: 'job_not_found', message: `Job ${input.jobId} not found` },
      };
    }

    const now = Date.now();
    const response: Record<string, unknown> = {
      jobId: job.id,
      serverId: job.serverId,
      command: job.command,
      status: job.status,
      startedAt: new Date(job.startedAt).toISOString(),
      elapsedMs: now - job.startedAt,
      bytesReceived: job.bytesReceived,
    };

    if (job.lastOutputAt) {
      response.lastOutputAt = new Date(job.lastOutputAt).toISOString();
      response.msSinceLastOutput = now - job.lastOutputAt;
    }

    if (job.completedAt) {
      response.completedAt = new Date(job.completedAt).toISOString();
      response.durationMs = job.completedAt - job.startedAt;
    }

    const effectiveMaxOutputLength = input.maxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;

    if (job.result) {
      const { text: stdout, truncated } = truncateOutput(
        job.result.stdout,
        effectiveMaxOutputLength,
      );
      response.result = { ...job.result, stdout };
      response.resultTruncated = truncated;
    }

    if (job.error) {
      response.error = job.error;
    }

    if (job.output) {
      const { text: partialOutput, truncated } = truncateOutput(
        job.output,
        effectiveMaxOutputLength,
      );
      response.partialOutput = partialOutput;
      response.partialOutputTruncated = truncated;
    }

    return { ok: true, data: response };
  } catch (error) {
    return failureFrom(error);
  }
}

/** In-memory registry first, then the disk store (CLI-spawned runner jobs). */
function resolveJob(jobId: string, deps: ActionDeps): Job | undefined {
  const inMemory = deps.jobRegistry.get(jobId);
  if (inMemory) return inMemory;

  if (!deps.jobStore) return undefined;
  const meta = deps.jobStore.read(jobId);
  if (!meta) return undefined;

  const output = cleanStreamedOutput(deps.jobStore.readOutput(jobId));
  const job: Job = {
    id: meta.id,
    serverId: meta.serverId,
    command: meta.command,
    status: meta.status,
    startedAt: meta.startedAt,
    completedAt: meta.completedAt,
    result: meta.result,
    error: meta.error,
    output,
    bytesReceived: Buffer.byteLength(output),
    lastOutputAt: deps.jobStore.outputMtime(jobId),
  };
  return job;
}

/** Removes shell protocol markers from raw streamed output (CLI runner jobs). */
function cleanStreamedOutput(raw: string): string {
  return stripControlSequences(raw)
    .replace(/__MCP_END_[a-z0-9]+_[a-z0-9]+__\s*\r?\n\s*\d+\s*\r?\n?/g, '')
    .replace(/__MCP_END_[a-z0-9]+_[a-z0-9]+__/g, '')
    .replace(/__MCP_PROMPT2?__\s*/g, '');
}
