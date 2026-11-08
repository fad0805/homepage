import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

const fetchMe = () =>
    fetch('/api/users/me', {
        method: 'GET',
        credentials: 'include',
    });

const isAuthenticated = async (router: AppRouterInstance) => {
    try {
        let response = await fetchMe();

        // If another request just rotated the auth cookies, a concurrent
        // check can briefly see a 401. Retry once before giving up.
        if (response.status === 401) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            response = await fetchMe();
        }

        if (!response.ok) {
            throw new Error('로그인 상태 확인 실패');
        }

        const data = await response.json();
        return data.success;
    } catch {
        router.push('/signin');
        return false;
    }
};

export { isAuthenticated };
