import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfigPath } from '../config/path.js';
function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
export class ForwardStore {
    file;
    constructor(file) {
        this.file = file ?? path.join(path.dirname(getConfigPath()), 'forwards.json');
    }
    add(entry) {
        const entries = this.read();
        entries.push(entry);
        this.write(entries);
    }
    removeByPid(pid) {
        this.write(this.read().filter((e) => e.pid !== pid));
    }
    /** Live entries only; entries of dead processes are pruned from disk. */
    list() {
        const entries = this.read();
        const live = entries.filter((e) => isPidAlive(e.pid));
        if (live.length !== entries.length) {
            this.write(live);
        }
        return live;
    }
    read() {
        try {
            return JSON.parse(fs.readFileSync(this.file, 'utf-8'));
        }
        catch {
            return [];
        }
    }
    write(entries) {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
        fs.renameSync(tmp, this.file);
    }
}
//# sourceMappingURL=forward-store.js.map