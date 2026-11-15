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

const DEFAULT_THEME_COLORS: Record<Theme, string> = {
    light: "#bedbbb",
    dark: "#090c0a",
};

function readStoredTheme(defaultTheme: Theme): Theme {
    if (typeof window === "undefined") return defaultTheme;

    try {
        const stored = window.localStorage.getItem("theme");
        return stored === "dark" || stored === "light"
            ? stored
            : defaultTheme;
    } catch {
        return defaultTheme;
    }
}

export const ThemeProvider = ({
children,
themeColors,
defaultTheme = "light",
nonce,
}:{
children: React.ReactNode;
themeColors?: Record<Theme, string>;
defaultTheme?: Theme;
nonce?: string;
}) => {
    const colors = themeColors ?? DEFAULT_THEME_COLORS;
    const lightColor = colors.light;
    const darkColor = colors.dark;
    const [theme, setThemeState] = useState<Theme>(() =>
        readStoredTheme(defaultTheme),
    );

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
                meta.setAttribute(
                    "content",
                    theme === "dark" ? darkColor : lightColor,
                ),
            );
    }, [theme, lightColor, darkColor]);

    const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

    useServerInsertedHTML(() => {
        return (
            <script
                nonce={nonce}
                dangerouslySetInnerHTML={{
                    __html: `
                        (function() {
                            try {
                                const storedTheme = localStorage.getItem('theme');
                                const theme =
                                    storedTheme === 'dark' || storedTheme === 'light'
                                        ? storedTheme
                                        : '${defaultTheme}';
                                const isDark = theme === 'dark';

                                if (isDark) {
                                    document.documentElement.setAttribute('data-theme', 'dark');
                                } else {
                                    document.documentElement.removeAttribute('data-theme');
                                }

                                document
                                    .querySelectorAll('meta[name="theme-color"]')
                                    .forEach(function(meta) {
                                        meta.setAttribute('content', isDark ? '${darkColor}' : '${lightColor}');
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
