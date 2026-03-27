import { API_BASE } from '../config/api';

export function resolveAssetUrl(url: string): string {
  return url.startsWith('/') ? `${API_BASE}${url}` : url;
}
