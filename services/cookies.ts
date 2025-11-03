export function getCookie(name: string): string | null {
  const cookieName = name + '=';
  const segments = document.cookie.split(';');
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].trim();
    if (segment.startsWith(cookieName)) {
      const value = segment.substring(cookieName.length);
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

export function setCookie(name: string, value: string, days = 365): void {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = 'expires=' + d.toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax`;
}
