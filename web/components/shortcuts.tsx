"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

import { isAuthenticated } from "@/components/authentication"

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
                if(
                    pathname.slice(0, 6) !== '/admin'
                    && pathname !== '/signin'
                ) {
                    isAuthenticated(router).then(isAuth => {
                        if(isAuth) router.push('/admin');
                        else router.push('/signin');
                    });
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
