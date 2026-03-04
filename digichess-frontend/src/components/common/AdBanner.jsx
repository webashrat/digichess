import { useEffect, useRef } from 'react';

export default function AdBanner({ format = 'auto', slot, className = '' }) {
    const adRef = useRef(null);
    const pushed = useRef(false);

    useEffect(() => {
        if (pushed.current) return;
        try {
            if (adRef.current && window.adsbygoogle) {
                window.adsbygoogle.push({});
                pushed.current = true;
            }
        } catch {
            // ad blocker or script not loaded
        }
    }, []);

    return (
        <div className={`ad-container overflow-hidden ${className}`}>
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
