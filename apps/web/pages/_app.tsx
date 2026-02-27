import type { AppProps } from "next/app";
import Head from "next/head";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <style>{`
          @import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Sora:wght@300;400;600;700&display=swap");
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          :root {
            --font-sans: "Sora", "Avenir Next", "Helvetica Neue", Arial, sans-serif;
            --font-mono: "JetBrains Mono", "SFMono-Regular", Menlo, monospace;
            --bg: #0b0f14;
            --bg-2: #0b1c26;
            --card: rgba(15, 23, 42, 0.78);
            --surface: rgba(30, 41, 59, 0.6);
            --border: rgba(148, 163, 184, 0.18);
            --text: #e2e8f0;
            --muted: #94a3b8;
            --muted-strong: #cbd5e1;
            --accent: #22d3ee;
            --accent-2: #f59e0b;
            --success: #22c55e;
            --warning: #f59e0b;
            --danger: #f43f5e;
            --shadow: 0 14px 36px rgba(2, 6, 23, 0.35);
          }
          html,
          body {
            background: radial-gradient(1200px 600px at 10% -10%, #16344a 0%, transparent 60%),
              radial-gradient(900px 500px at 110% 0%, #13314a 0%, transparent 55%),
              linear-gradient(160deg, var(--bg-2) 0%, var(--bg) 60%);
            color: var(--text);
            font-family: var(--font-sans);
            min-height: 100%;
          }
          body::before {
            content: "";
            position: fixed;
            inset: -20%;
            background: radial-gradient(600px 400px at 70% 20%, rgba(34, 211, 238, 0.12), transparent 60%),
              radial-gradient(500px 360px at 20% 80%, rgba(245, 158, 11, 0.12), transparent 60%);
            pointer-events: none;
            z-index: 0;
          }
          #__next {
            position: relative;
            z-index: 1;
          }
          a {
            color: var(--accent);
          }
          @keyframes fadeUp {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </Head>
      <Component {...pageProps} />
    </>
  );
}