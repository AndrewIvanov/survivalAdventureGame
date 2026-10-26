// A slow database must never reorder snapshots or stall the simulation.
// At most one write and one pending (coalesced) snapshot are retained per world.
export class SaveQueue {
  constructor(store, onError = () => {}) {
    this.store = store; this.onError = onError; this.jobs = new Map(); this.retryAt = new Map();
  }

  busy(world) { return this.jobs.has(world.id); }
  canAutosave(world) { return !this.busy(world) && Date.now() >= (this.retryAt.get(world.id) || 0); }

  save(world) {
    const snapshot = JSON.parse(JSON.stringify(world.serialize()));
    world.criticalSave = false;
    return new Promise(resolve => {
      let job = this.jobs.get(world.id);
      if (job) {
        if (job.pending) { job.pending.snapshot = snapshot; job.pending.waiters.push(resolve); }
        else job.pending = { snapshot, waiters: [resolve] };
      } else {
        job = { pending: { snapshot, waiters: [resolve] } };
        this.jobs.set(world.id, job);
        job.done = this.drain(world, job);
      }
    });
  }

  async drain(world, job) {
    while (job.pending) {
      const { snapshot, waiters } = job.pending; job.pending = null;
      let ok = false;
      try {
        world.savedAt = await this.store.save(snapshot);
        this.retryAt.delete(world.id); ok = true;
      } catch (error) {
        world.criticalSave = true;
        this.retryAt.set(world.id, Date.now() + 5000);
        this.onError(world, error);
      }
      for (const resolve of waiters) resolve(ok);
    }
    this.jobs.delete(world.id);
  }

  async flush() { await Promise.all([...this.jobs.values()].map(job => job.done)); }
}
