import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { isPortrait, resolveDevice, type DeviceKind } from '../util/device';

/** Blocks non-iOS devices, and portrait iPhones, before the game renders. */
export function DeviceGate({ children }: { children: React.ReactNode }) {
  const [device] = useState<DeviceKind>(() => resolveDevice());
  const [portrait, setPortrait] = useState(isPortrait());
  const [qr, setQr] = useState('');

  useEffect(() => {
    const on = () => setPortrait(isPortrait());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);

  useEffect(() => {
    if (device !== 'unsupported') return;
    const url = location.origin + location.pathname;
    QRCode.toDataURL(url, { margin: 1, width: 400, color: { dark: '#07090f', light: '#ffffff' } }).then(setQr).catch(() => setQr(''));
  }, [device]);

  if (device === 'unsupported') {
    return (
      <div className="gate">
        <div className="logo">
          TRY <span>LINE</span>
        </div>
        <h1>
          Try Line is only available on <span>iPhone</span> and <span>iPad</span>
        </h1>
        {qr && <img src={qr} alt="QR code linking to Try Line" />}
        <p className="muted" style={{ maxWidth: 460 }}>
          Scan the code with your iPhone or iPad camera, open it in Safari, then tap Share → Add to Home Screen to play full screen.
        </p>
      </div>
    );
  }

  if (device === 'iphone' && portrait) {
    return (
      <div className="gate">
        <div className="rotate-icon" />
        <h1>
          Rotate your <span>device</span>
        </h1>
        <p className="muted">Try Line plays in landscape on iPhone.</p>
      </div>
    );
  }

  return <>{children}</>;
}
