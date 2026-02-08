const GOOGLE_CLIENT_ID = '450321746541-jcejg7kh2nrbt230cgjip9fpplpn27r3.apps.googleusercontent.com';

export interface GoogleAuthResult {
  idToken: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  googleId: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

let gsiLoaded = false;

function loadGsiScript(): Promise<void> {
  if (gsiLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      gsiLoaded = true;
      return resolve();
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => { gsiLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

export async function signInWithGooglePopup(): Promise<GoogleAuthResult> {
  await loadGsiScript();

  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    if (!google?.accounts?.id) {
      return reject(new Error('Google Identity Services not available'));
    }

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential: string }) => {
        try {
          const payload = decodeJwtPayload(response.credential);
          resolve({
            idToken: response.credential,
            email: (payload.email as string) || '',
            displayName: (payload.name as string) || '',
            photoURL: (payload.picture as string) || null,
            googleId: (payload.sub as string) || '',
          });
        } catch (err) {
          reject(new Error('Failed to decode Google credential'));
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // One-tap not available — fall back to button click flow
        const btn = document.createElement('div');
        btn.id = '__gsi_temp_btn';
        btn.style.position = 'fixed';
        btn.style.top = '-9999px';
        document.body.appendChild(btn);
        google.accounts.id.renderButton(btn, {
          type: 'standard',
          size: 'large',
          click_listener: () => {},
        });
        const inner = btn.querySelector('[role="button"]') as HTMLElement
          || btn.querySelector('div[tabindex]') as HTMLElement
          || btn.firstElementChild as HTMLElement;
        if (inner) inner.click();
        setTimeout(() => btn.remove(), 100);
      }
    });
  });
}

export async function signOutFirebase(): Promise<void> {
  try {
    const google = (window as any).google;
    google?.accounts?.id?.disableAutoSelect();
  } catch {}
}
