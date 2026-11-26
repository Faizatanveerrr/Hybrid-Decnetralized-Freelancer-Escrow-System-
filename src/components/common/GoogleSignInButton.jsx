import React, { useEffect, useRef, useState } from 'react';

const SRC = 'https://accounts.google.com/gsi/client';

/**
 * Official "Sign in with Google" button (Google Identity Services). It hands back an ID token
 * (credential) that the server verifies. Renders nothing until a client id is configured.
 */
export default function GoogleSignInButton({ clientId, onCredential, text = 'continue_with' }) {
  const holder = useRef(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;

    const init = () => {
      if (cancelled || !window.google?.accounts?.id || !holder.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (r) => { if (r?.credential) callback.current(r.credential); }
      });
      holder.current.innerHTML = '';
      window.google.accounts.id.renderButton(holder.current, { theme: 'outline', size: 'large', shape: 'pill', width: 300, text });
    };

    if (window.google?.accounts?.id) {
      init();
      return () => { cancelled = true; };
    }
    let script = document.querySelector(`script[src="${SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const onError = () => { if (!cancelled) setFailed(true); };
    script.addEventListener('load', init);
    script.addEventListener('error', onError);
    return () => {
      cancelled = true;
      script.removeEventListener('load', init);
      script.removeEventListener('error', onError);
    };
  }, [clientId, text]);

  if (!clientId) return null;
  return (
    <div>
      <div ref={holder} className="flex justify-center min-h-[44px]" />
      {failed && <p className="mt-1 text-center text-[11px] text-slate-500">Google sign-in could not load. Check your internet connection.</p>}
    </div>
  );
}
