import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

const isAuthenticated = (router: AppRouterInstance) => {
    return fetch('/api/users/me', {
        method: 'GET',
        credentials: 'include',
    }).then((res) => {
        if (res.ok) {
            return res.json();
        } else {
            throw new Error('로그인 상태 확인 실패');
        }
    }).then((data) => {
        return data.success;
    }).catch(() => {
        router.push('/signin');
    });
};

export { isAuthenticated };
