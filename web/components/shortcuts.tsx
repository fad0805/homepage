"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

import { isAuthenticated } from "@/components/authentication"

function isEditableElement(element: Element | null) {
    if (!element) return false;

    return (
        element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT' ||
        (element as HTMLElement).isContentEditable
    );
}

export const Shortcuts = ({
children,
}:{
children: React.ReactNode;
}) => {
    const pathname = usePathname();
    const router = useRouter();
    
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing) return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;

            if (isEditableElement(document.activeElement)) return;

            // Check the physical key as well so the shortcut keeps working
            // while a Korean (or other non-Latin) input mode is active.
            if (
                event.code === 'KeyQ' ||
                event.key === 'q' ||
                event.key === 'Q'
            ) {
                if(!pathname.startsWith('/admin') && pathname !== '/signin') {
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
    }, [pathname, router]);

    return <>{children}</>;
};
