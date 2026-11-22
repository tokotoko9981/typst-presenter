import type { SyncMessage } from './types.ts';

const HEARTBEAT_INTERVAL_MS = 450;
const PEER_TIMEOUT_MS = 1600;

export class SyncBridge {
  readonly sessionId: string;
  readonly role: 'presenter' | 'audience';
  readonly clientId: string;

  private channel: BroadcastChannel | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly peers = new Map<string, number>();
  private readonly messageListeners = new Set<(msg: SyncMessage) => void>();
  private readonly connectionListeners = new Set<(connected: boolean, count: number) => void>();
  private lastConnectedState = false;

  constructor(sessionId: string, role: 'presenter' | 'audience') {
    this.sessionId = sessionId;
    this.role = role;
    this.clientId = `${role}-${Math.random().toString(36).slice(2, 10)}`;
  }

  start(): void {
    if (this.channel) return;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(`typst-presenter-sync-${this.sessionId}`);
        this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
          const msg = event.data;
          if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
          this.handleIncoming(msg);
        };
      } catch {
        this.channel = null;
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleUnload);
      window.addEventListener('pagehide', this.handleUnload);
    }

    this.post({
      type: 'HELLO',
      role: this.role,
      clientId: this.clientId,
      ts: Date.now(),
    });

    this.heartbeatTimer = setInterval(() => {
      this.post({
        type: 'HEARTBEAT',
        role: this.role,
        clientId: this.clientId,
        ts: Date.now(),
      });
      this.pruneStalePeers();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private readonly handleUnload = (): void => {
    this.post({
      type: 'BYE',
      role: this.role,
      clientId: this.clientId,
      ts: Date.now(),
    });
  };

  private handleIncoming(msg: SyncMessage): void {
    const targetRole = this.role === 'presenter' ? 'audience' : 'presenter';

    if (msg.type === 'HELLO' || msg.type === 'HEARTBEAT') {
      if (msg.role === targetRole) {
        this.peers.set(msg.clientId, Date.now());
        this.notifyConnectionChange();
      }
      if (msg.type === 'HELLO' && msg.role === targetRole) {
        // Reply with a heartbeat immediately so the peer also marks us connected
        this.post({
          type: 'HEARTBEAT',
          role: this.role,
          clientId: this.clientId,
          ts: Date.now(),
        });
      }
    } else if (msg.type === 'BYE') {
      if (msg.role === targetRole) {
        this.peers.delete(msg.clientId);
        this.notifyConnectionChange();
      }
    }

    for (const listener of this.messageListeners) {
      listener(msg);
    }
  }

  private pruneStalePeers(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, lastSeen] of this.peers.entries()) {
      if (now - lastSeen > PEER_TIMEOUT_MS) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.notifyConnectionChange();
    }
  }

  private notifyConnectionChange(): void {
    const connected = this.peers.size > 0;
    if (connected !== this.lastConnectedState || connected) {
      this.lastConnectedState = connected;
      for (const cb of this.connectionListeners) {
        cb(connected, this.peers.size);
      }
    }
  }

  post(msg: SyncMessage): void {
    if (!this.channel) return;
    try {
      this.channel.postMessage(msg);
    } catch {
      // Ignore postMessage errors if channel closed
    }
  }

  onMessage(cb: (msg: SyncMessage) => void): () => void {
    this.messageListeners.add(cb);
    return () => {
      this.messageListeners.delete(cb);
    };
  }

  onConnectionChange(cb: (connected: boolean, count: number) => void): () => void {
    this.connectionListeners.add(cb);
    cb(this.peers.size > 0, this.peers.size);
    return () => {
      this.connectionListeners.delete(cb);
    };
  }

  isConnected(): boolean {
    return this.peers.size > 0;
  }

  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleUnload);
      window.removeEventListener('pagehide', this.handleUnload);
    }
    this.handleUnload();
    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        // Ignore close errors
      }
      this.channel = null;
    }
    this.peers.clear();
    this.messageListeners.clear();
    this.connectionListeners.clear();
  }
}
