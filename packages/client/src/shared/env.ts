export function getApiUrl(): string {
  const address = localStorage.getItem('uno-current-server-address');
  if (!address) return import.meta.env.VITE_API_URL ?? '';
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${address}`;
}
