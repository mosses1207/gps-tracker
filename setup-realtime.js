import { initializeRealtimeSync } from './querysupabase';
import { dlog } from './debug';

export function setupRealtimeSync() {
    initializeRealtimeSync();
    dlog('Real-time sync initialized');
}
