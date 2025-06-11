"use client";
import { useEffect, useState } from "react";
import { useServerInsertedHTML } from "next/navigation";

export const ThemeProvider = ({
children,
}:{
children: React.ReactNode;
}) => {
    const [currentTheme, setCurrentTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');
        }
        return 'light';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', currentTheme === 'dark' ? 'dark' : 'light');

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'd' || event.key === 'D') {
                setCurrentTheme(prevTheme => {
                    const newTheme = prevTheme === 'dark' ? 'light' : 'dark';
                    localStorage.setItem('theme', newTheme);
                    document.documentElement.setAttribute('data-theme', newTheme);
                    return newTheme;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [currentTheme]);

    useServerInsertedHTML(() => {
        return (
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        (function() {
                            try {
                                const theme = localStorage.getItem('theme');
                                if (theme === 'dark') {
                                    document.documentElement.setAttribute('data-theme', 'dark');
                                } else {
                                    document.documentElement.removeAttribute('data-theme');
                                }
                            } catch (e) {
                                console.error('Failed to set initial theme:', e);
                            }
                        })();
                    `,
                }}
            />
        );
    });

    return <>{children}</>;
};
