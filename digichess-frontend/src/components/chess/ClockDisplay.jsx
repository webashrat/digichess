import { memo, useEffect, useRef, useState } from 'react';

function ClockDisplayBase({ seconds, isActive, className = '' }) {
    const [displaySeconds, setDisplaySeconds] = useState(seconds);
    const anchorRef = useRef(null);
    const wasActiveRef = useRef(false);

    useEffect(() => {
        const turnChanged = isActive !== wasActiveRef.current;
        wasActiveRef.current = isActive;

        if (seconds == null) {
            anchorRef.current = null;
            setDisplaySeconds(seconds);
            return;
        }

        if (!isActive) {
            anchorRef.current = null;
            setDisplaySeconds(seconds);
            return;
        }

        if (turnChanged || !anchorRef.current) {
            anchorRef.current = { seconds, at: Date.now() };
            setDisplaySeconds(seconds);
            return;
        }

        const elapsed = (Date.now() - anchorRef.current.at) / 1000;
        const expected = anchorRef.current.seconds - elapsed;
        const drift = Math.abs(seconds - expected);
        if (drift > 0.5) {
            anchorRef.current = { seconds, at: Date.now() };
            setDisplaySeconds(seconds);
        }
    }, [seconds, isActive]);

    useEffect(() => {
        if (!isActive) return;
        const tick = setInterval(() => {
            if (!anchorRef.current) return;
            const elapsed = (Date.now() - anchorRef.current.at) / 1000;
            setDisplaySeconds(Math.max(0, anchorRef.current.seconds - elapsed));
        }, 100);
        return () => clearInterval(tick);
    }, [isActive]);

    const value = displaySeconds ?? seconds;
    let text = '--:--';
    if (value != null) {
        const total = Math.max(0, value);
        const m = Math.floor(total / 60);
        const sec = Math.floor(total % 60);
        const tenths = Math.floor((total % 1) * 10);
        if (m >= 60) {
            const h = Math.floor(m / 60);
            text = `${h}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        } else if (total < 10) {
            text = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenths}`;
        } else {
            text = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
    }

    return <span className={className}>{text}</span>;
}

const ClockDisplay = memo(ClockDisplayBase);
ClockDisplay.displayName = 'ClockDisplay';
export default ClockDisplay;
