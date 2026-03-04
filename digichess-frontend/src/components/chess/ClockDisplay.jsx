import { memo, useEffect, useRef, useState } from 'react';

function ClockDisplayBase({ seconds, isActive, className = '' }) {
    const [displaySeconds, setDisplaySeconds] = useState(seconds);
    const anchorRef = useRef({ seconds, at: Date.now() });

    useEffect(() => {
        anchorRef.current = { seconds, at: Date.now() };
        setDisplaySeconds(seconds);
    }, [seconds]);

    useEffect(() => {
        if (!isActive || seconds == null) return;
        const tick = setInterval(() => {
            const elapsed = Math.floor((Date.now() - anchorRef.current.at) / 1000);
            setDisplaySeconds(Math.max(0, anchorRef.current.seconds - elapsed));
        }, 100);
        return () => clearInterval(tick);
    }, [isActive, seconds]);

    const value = displaySeconds ?? seconds;
    let text = '--:--';
    if (value != null) {
        const s = Math.max(0, Math.round(value));
        const m = Math.floor(s / 60);
        const sec = s % 60;
        if (m >= 60) {
            const h = Math.floor(m / 60);
            text = `${h}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        } else {
            text = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
    }

    return <span className={className}>{text}</span>;
}

const ClockDisplay = memo(ClockDisplayBase);
ClockDisplay.displayName = 'ClockDisplay';
export default ClockDisplay;
