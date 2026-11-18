
import { Preferences } from '@capacitor/preferences';

const API_BASE = 'https://hupera-ai.hatchable.site/api';
const TOKEN_KEY = 'hupera_mobile_access_token';

type ApiResponse = {
  success?: boolean;
  error?: string;
  [key: string]: unknown;
};

async function request<T extends ApiResponse>(
  url: string,
  options: RequestInit = {},
  authenticated = false
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (authenticated) {
    const token = await getToken();
    if (!token) throw new Error('Please sign in again.');

    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({})) as T;

  if (response.status === 401 && authenticated) {
    await clearToken();
  }

  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.') as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = String((data as any).code || '');
    throw error;
  }

  return data;
}

export async function getToken(): Promise<string | null> {
  const result = await Preferences.get({ key: TOKEN_KEY });
  return result.value;
}

export async function clearToken(): Promise<void> {
  await Preferences.remove({ key: TOKEN_KEY });
}

export async function sendOtp(email: string) {
  return request<{
    success: boolean;
    challengeId: string;
    email: string;
    expiresInSeconds: number;
    resendAfterSeconds: number;
    error?: string;
  }>(`${API_BASE}/hupera-mobile-auth`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'send',
      email: email.trim().toLowerCase()
    })
  });
}

export async function verifyOtp(
  email: string,
  challengeId: string,
  otp: string
) {
  const result = await request<{
    success: boolean;
    accessToken: string;
    email: string;
    expiresIn: number;
    error?: string;
  }>(`${API_BASE}/hupera-mobile-auth`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'verify',
      email: email.trim().toLowerCase(),
      challengeId,
      otp: otp.trim()
    })
  });

  if (!result.accessToken) {
    throw new Error('Sign-in did not return a valid session.');
  }

  await Preferences.set({
    key: TOKEN_KEY,
    value: result.accessToken
  });

  return result;
}

export async function getHuperaResource<T extends ApiResponse>(
  resource: string,
  params: Record<string, string> = {}
): Promise<T> {
  const query = new URLSearchParams({ resource, ...params });

  return request<T>(
    `${API_BASE}/upriai-bridge?${query.toString()}`,
    {},
    true
  );
}

export async function postHuperaAction<T extends ApiResponse>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  return request<T>(
    `${API_BASE}/upriai-bridge`,
    {
      method: 'POST',
      body: JSON.stringify({ action, ...payload })
    },
    true
  );
}
export async function getCashfreeSubscription(orderId?: string) {
  const query = orderId ? '?order_id=' + encodeURIComponent(orderId) : '';
  return request<any>(`${API_BASE}/cashfree-mobile-subscription${query}`, {}, true);
}

export async function createCashfreeSubscriptionOrder(cycle: 'monthly' | 'annually') {
  return request<any>(`${API_BASE}/cashfree-mobile-subscription`, {
    method: 'POST',
    body: JSON.stringify({ cycle })
  }, true);
}

export async function exchangeMobileCode(code: string): Promise<void> {
  const response = await fetch(`${API_BASE}/hupera-mobile-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  const data = await response.json().catch(() => ({})) as {
    accessToken?: string;
    error?: string;
  };

  if (!response.ok || !data.accessToken) {
    throw new Error(data.error || 'Mobile login failed');
  }

  await Preferences.set({
    key: TOKEN_KEY,
    value: data.accessToken,
  });
}
