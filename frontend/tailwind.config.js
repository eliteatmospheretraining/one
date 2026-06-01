/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
        "./public/index.html"
    ],
    theme: {
        extend: {
            fontFamily: {
                thunder: ['Thunder', 'Impact', 'sans-serif'],
                sans: ['Thunder', 'Impact', 'sans-serif'],
            },
            colors: {
                ink: '#141414',
                paper: '#F5F5F5',
                accent: {
                    DEFAULT: '#CBFF00',
                    soft: '#E4FF7A',
                },
                mid: '#1E1E1E',
                subtle: '#2A2A2A',
                muted: '#888888',
                danger: '#FF4444',
                // Shadcn tokens (mapped to dark theme)
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))'
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))'
                },
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))'
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))'
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))'
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
            },
            borderRadius: {
                lg: '2px',
                md: '2px',
                sm: '2px',
                DEFAULT: '0px',
            },
            keyframes: {
                'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
                'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
                'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
                'fade-in': 'fade-in 150ms ease-out',
            },
            letterSpacing: {
                wider2: '0.15em',
                wider3: '0.2em',
            }
        }
    },
    plugins: [require("tailwindcss-animate")],
};
