// ⬇️ app/page.tsx (대략 15~45줄)
import Link from 'next/link';

export default function Home() {
  return (
    <main
      style={{
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'system-ui',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {/* Title */}
        <h1
          style={{
            fontSize: 64,
            fontWeight: 800,
            marginBottom: 12,
            letterSpacing: '0.05em',
          }}
        >
          DUTCHIE
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 18,
            opacity: 0.75,
            marginBottom: 32,
          }}
        >
          simple & easy money split app
        </p>

        {/* Get Started Button */}
        <Link href="/add_ppl">
          <button
            style={{
              padding: '14px 28px',
              fontSize: 16,
              borderRadius: 10,
              border: '1px solid #333',
              backgroundColor: '#fff',
              color: '#000000ff',
              cursor: 'pointer',
            }}
          >
            Get Started
          </button>
        </Link>
      </div>
    </main>
  );
}
