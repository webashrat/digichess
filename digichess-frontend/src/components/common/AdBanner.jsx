import { useEffect, useRef, useState } from 'react';

export default function AdBanner({ format = 'auto', slot, className = '' }) {
    const adRef = useRef(null);
    const pushed = useRef(false);
    const [filled, setFilled] = useState(false);

    useEffect(() => {
        if (pushed.current) return;
        try {
            if (adRef.current && window.adsbygoogle) {
                window.adsbygoogle.push({});
                pushed.current = true;
            }
        } catch {
            return;
        }
        const timer = setTimeout(() => {
            const ins = adRef.current;
            if (ins && ins.getAttribute('data-ad-status') === 'filled') {
                setFilled(true);
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className={`ad-container overflow-hidden ${className}`} style={filled ? undefined : { minHeight: 0, maxHeight: 0, overflow: 'hidden' }}>
            <ins
                ref={adRef}
                className="adsbygoogle"
                style={{ display: 'block' }}
                data-ad-client="ca-pub-4673888353435935"
                data-ad-slot={slot || ''}
                data-ad-format={format}
                data-full-width-responsive="true"
            />
        </div>
    );
}
