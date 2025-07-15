"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export const Shortcuts = ({
children,
}:{
children: React.ReactNode;
}) => {
    const pathname = usePathname();
    const router = useRouter();
    
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isInputField = 
                activeElement?.tagName === 'INPUT' ||
                activeElement?.tagName === 'TEXTAREA' ||
                activeElement?.tagName === 'SELECT';

            if (isInputField) return;

            if (event.key === 'q' || event.key === 'Q') {
                const isAuthenticated = () => {
                    fetch('/api/users/me', {
                        method: 'GET',
                        credentials: 'include',
                    }).then((res) => {
                        if (res.ok) {
                            return res.json();
                        } else {
                            throw new Error('로그인 상태 확인 실패');
                        }
                    }).then((data) => {
                        if (data.success) {
                            router.push('/admin');
                        }
                        router.push('/signin');
                    }).catch(() => {
                        router.push('/signin');
                    });
                };

                if(pathname !== '/admin' || pathname !== '/signin') {
                    isAuthenticated();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return <>{children}</>;
};
