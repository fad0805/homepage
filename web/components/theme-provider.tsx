"use client";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { useServerInsertedHTML } from "next/navigation";

export type Theme = "light" | "dark";

interface ThemeContextValue {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_COLORS: Record<Theme, string> = {
    light: "#bedbbb",
    dark: "#090c0a",
};

function readStoredTheme(): Theme {
    if (typeof window === "undefined") return "light";

    try {
        return window.localStorage.getItem("theme") === "dark" ? "dark" : "light";
    } catch {
        return "light";
    }
}

export const ThemeProvider = ({
children,
}:{
children: React.ReactNode;
}) => {
    const [theme, setThemeState] = useState<Theme>(readStoredTheme);

    const setTheme = useCallback((nextTheme: Theme) => {
        setThemeState(nextTheme);

        try {
            window.localStorage.setItem("theme", nextTheme);
        } catch {
            // The selected theme still applies for this session.
        }
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);

        document
            .querySelectorAll('meta[name="theme-color"]')
            .forEach((meta) =>
                meta.setAttribute("content", THEME_COLORS[theme]),
            );
    }, [theme]);

    const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

    useServerInsertedHTML(() => {
        return (
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        (function() {
                            try {
                                const theme = localStorage.getItem('theme');
                                const isDark = theme === 'dark';

                                if (isDark) {
                                    document.documentElement.setAttribute('data-theme', 'dark');
                                } else {
                                    document.documentElement.removeAttribute('data-theme');
                                }

                                document
                                    .querySelectorAll('meta[name="theme-color"]')
                                    .forEach(function(meta) {
                                        meta.setAttribute('content', isDark ? '#090c0a' : '#bedbbb');
                                    });
                            } catch (e) {
                                console.error('Failed to set initial theme:', e);
                            }
                        })();
                    `,
                }}
            />
        );
    });

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error("useTheme must be used inside ThemeProvider");
    }

    return context;
}
