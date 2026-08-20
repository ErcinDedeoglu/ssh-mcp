import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { getConfigPath } from '../config/path.js';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_TRACKED_JOBS = 200;
export class JobStore {
    dir;
    constructor(dir) {
        this.dir = dir ?? path.join(path.dirname(getConfigPath()), 'jobs');
    }
    get jobsDir() {
        return this.dir;
    }
    newId() {
        return `job_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    }
    save(meta) {
        this.ensureDir();
        const target = this.metaPath(meta.id);
        const tmp = `${target}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(meta, null, 2));
        fs.renameSync(tmp, target);
    }
    read(jobId) {
        try {
            const raw = fs.readFileSync(this.metaPath(jobId), 'utf-8');
            return JSON.parse(raw);
        }
        catch {
            return undefined;
        }
    }
    appendOutput(jobId, chunk) {
        this.ensureDir();
        fs.appendFileSync(this.outputPath(jobId), chunk);
    }
    readOutput(jobId) {
        try {
            return fs.readFileSync(this.outputPath(jobId), 'utf-8');
        }
        catch {
            return '';
        }
    }
    outputMtime(jobId) {
        try {
            return fs.statSync(this.outputPath(jobId)).mtimeMs;
        }
        catch {
            return undefined;
        }
    }
    list() {
        this.ensureDir();
        const metas = [];
        for (const file of fs.readdirSync(this.dir)) {
            if (!file.endsWith('.json'))
                continue;
            const meta = this.read(file.replace(/\.json$/, ''));
            if (meta)
                metas.push(meta);
        }
        return metas.sort((a, b) => b.startedAt - a.startedAt);
    }
    remove(jobId) {
        for (const file of [this.metaPath(jobId), this.outputPath(jobId)]) {
            try {
                fs.rmSync(file);
            }
            catch {
                // Already gone
            }
        }
    }
    /** Drops terminal jobs older than 24h and enforces the tracking cap. */
    prune() {
        const metas = this.list();
        const now = Date.now();
        const terminal = (m) => m.status === 'completed' || m.status === 'failed' || m.status === 'cancelled';
        const expired = metas.filter((m) => terminal(m) && (m.completedAt ?? m.startedAt) < now - MS_PER_DAY);
        for (const meta of expired)
            this.remove(meta.id);
        const remaining = this.list().filter((m) => !expired.some((e) => e.id === m.id));
        if (remaining.length > MAX_TRACKED_JOBS) {
            for (const meta of remaining.slice(MAX_TRACKED_JOBS))
                this.remove(meta.id);
        }
    }
    ensureDir() {
        fs.mkdirSync(this.dir, { recursive: true });
    }
    metaPath(jobId) {
        return path.join(this.dir, `${jobId}.json`);
    }
    outputPath(jobId) {
        return path.join(this.dir, `${jobId}.output`);
    }
}
//# sourceMappingURL=job-store.js.map