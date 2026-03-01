import type { AppProps } from "next/app";
import Head from "next/head";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <style>{`
          @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap");
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          :root {
            --font-sans: "Inter", "Avenir Next", "Helvetica Neue", Arial, sans-serif;
            --font-mono: "JetBrains Mono", "SFMono-Regular", Menlo, monospace;
            --bg: #09090B;
            --bg-2: #0f1217;
            --card: rgba(20, 22, 26, 0.9);
            --surface: rgba(30, 34, 40, 0.65);
            --border: rgba(255, 255, 255, 0.08);
            --text: #FFFFFF;
            --muted: #d0d0d5;
            --muted-strong: #f1f1f3;
            --accent: #00E5A0;      /* mint */
            --accent-2: #00E5A0;
            --success: #16A34A;     /* traffic green */
            --warning: #F59E0B;     /* traffic amber */
            --danger: #EF4444;      /* traffic red */
            --shadow: 0 14px 36px rgba(0, 0, 0, 0.45);
          }
          html,
          body {
            background: radial-gradient(900px 520px at 20% -10%, rgba(0, 229, 160, 0.12) 0%, transparent 55%),
              radial-gradient(700px 480px at 110% 10%, rgba(0, 229, 160, 0.08) 0%, transparent 55%),
              linear-gradient(165deg, var(--bg-2) 0%, var(--bg) 65%);
            color: var(--text);
            font-family: var(--font-sans);
            min-height: 100%;
          }
          body::before {
            content: "";
            position: fixed;
            inset: -20%;
            background: radial-gradient(520px 360px at 70% 18%, rgba(0, 229, 160, 0.1), transparent 60%),
              radial-gradient(460px 320px at 18% 78%, rgba(255, 255, 255, 0.06), transparent 60%);
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
