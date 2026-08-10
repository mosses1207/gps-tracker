//realtime.js
import { supabase } from './supabaseClient';
import { dlog } from './debug';

const TABLE = 'path_history';

let activeChannel = null;
let isOpening = false;
let fetchingMissed = false;

export async function openRealtimeChannel() {
    if (isOpening) return;
    isOpening = true;

    try {
        closeRealtimeChannel();

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
            console.error('[RT] No session available');
            return;
        }

        dlog('[RT] Subscribing to', TABLE, '...');

        const channel = supabase
            .channel(`${TABLE}-changes`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: TABLE },
                handleRealtimeEvent
            )
            .subscribe((status, err) => {
                dlog('[RT] Channel status:', status);
                if (status === 'SUBSCRIBED') {
                    fetchMissed();
                }
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.warn('[RT] Channel issue:', status, err);
                }
            });

        activeChannel = channel;
    } catch (err) {
        console.error('[RT] Error opening channel:', err);
        closeRealtimeChannel();
    } finally {
        isOpening = false;
    }
}

export function closeRealtimeChannel() {
    if (activeChannel) {
        supabase.removeChannel(activeChannel);
        activeChannel = null;
    }
}

export function getActiveChannel() {
    return activeChannel;
}

async function handleRealtimeEvent(payload) {
    dlog('[RT EVENT]', payload.eventType);

    const hasNew = payload.new && Object.keys(payload.new).length > 0;
    const hasOld = payload.old && Object.keys(payload.old).length > 0;

    if (!hasNew && !hasOld) return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const newRow = hasNew ? payload.new : null;
        const oldRow = hasOld ? payload.old : null;

        if (newRow?.created_at) {
            localStorage.setItem('last_event_ts', newRow.created_at);
        }

        emit({
            eventType: payload.eventType,
            new: newRow,
            old: oldRow,
        });
    } catch (err) {
        console.error('[RT] Gagal proses event:', err);
    }
}

async function fetchMissed() {
    if (fetchingMissed) return;
    fetchingMissed = true;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const since = localStorage.getItem('last_event_ts')
            ?? new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();

        dlog('[RT HISTORY] Fetching since:', since);

        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .gt('created_at', since)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[RT HISTORY] Error fetching history:', error);
            return;
        }

        const rows = data || [];
        if (rows.length) {
            dlog(`[RT HISTORY] Got ${rows.length} historical rows`);
            rows.slice().reverse().forEach((item) => {
                emit({ eventType: 'INSERT', new: item, old: null });
            });
            const latest = rows[0]?.created_at;
            if (latest) localStorage.setItem('last_event_ts', latest);
        }
    } catch (err) {
        console.error('[RT HISTORY] Error fetching history:', err);
    } finally {
        fetchingMissed = false;
    }
}

function emit(payload) {
    dlog('[RT EMIT]', payload?.eventType);
    window.dispatchEvent(new CustomEvent('bridge:data', { detail: payload }));
}
