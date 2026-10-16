/** El radiocasete de la pantalla de entrada, con sus pegatinas (sin nombres de géneros). */
export function Boombox() {
  return (
    <div className="boombox" aria-hidden="true">
      <svg viewBox="0 0 350 212" className="boombox-svg">
        <line x1="298" y1="42" x2="334" y2="2" stroke="#CFC6E6" strokeWidth="3" strokeLinecap="round" />
        <circle cx="334" cy="3" r="3.5" fill="#CFC6E6" />
        <path d="M100 42 V22 a10 10 0 0 1 10 -10 H240 a10 10 0 0 1 10 10 V42" fill="none" stroke="#CFC6E6" strokeWidth="8" strokeLinecap="round" />
        <rect x="136" y="30" width="22" height="13" rx="3" fill="#2A2140" />
        <circle cx="147" cy="36.5" r="3.5" fill="#E5243B" />
        <rect x="164" y="30" width="22" height="13" rx="3" fill="#2A2140" />
        <path d="M172 32.5 v8 l7 -4 z" fill="#3DE3FF" />
        <rect x="192" y="30" width="22" height="13" rx="3" fill="#2A2140" />
        <rect x="199" y="33" width="7" height="7" fill="#CFC6E6" />
        <rect x="4" y="42" width="342" height="166" rx="24" fill="#1A1030" stroke="#3A2E5C" strokeWidth="2" />
        <rect x="14" y="52" width="322" height="146" rx="18" fill="none" stroke="#FFFFFF" strokeOpacity="0.05" />

        <circle cx="72" cy="130" r="54" fill="#0E0A18" stroke="#3A2E5C" strokeWidth="2" />
        <g className="pump">
          <circle cx="72" cy="130" r="42" fill="#130D22" stroke="#FF3D9A" strokeOpacity="0.45" strokeWidth="2" />
          <circle cx="72" cy="130" r="28" fill="#1A1030" stroke="#FFFFFF" strokeOpacity="0.08" />
          <circle cx="72" cy="130" r="13" fill="#2A2140" />
        </g>
        <circle cx="278" cy="130" r="54" fill="#0E0A18" stroke="#3A2E5C" strokeWidth="2" />
        <g className="pump" style={{ animationDelay: '-0.26s' }}>
          <circle cx="278" cy="130" r="42" fill="#130D22" stroke="#3DE3FF" strokeOpacity="0.45" strokeWidth="2" />
          <circle cx="278" cy="130" r="28" fill="#1A1030" stroke="#FFFFFF" strokeOpacity="0.08" />
          <circle cx="278" cy="130" r="13" fill="#2A2140" />
        </g>

        <rect x="138" y="62" width="74" height="18" rx="4" fill="#050A0C" stroke="#1E3A40" />
        {[
          ['#3DE3FF', 0],
          ['#3DE3FF', -0.2],
          ['#3DE3FF', -0.4],
          ['#FFC23D', -0.1],
          ['#FFC23D', -0.3],
          ['#FF3D9A', -0.5],
          ['#FF3D9A', -0.15],
          ['#E5243B', -0.35],
        ].map(([color, delay], i) => (
          <rect key={i} className="vu" x={144 + i * 8} y="66" width="5" height="11" fill={color as string} style={{ animationDelay: `${delay}s` }} />
        ))}

        <rect x="132" y="88" width="86" height="64" rx="8" fill="#0C0817" stroke="#3DE3FF" strokeOpacity="0.7" />
        <rect x="138" y="94" width="74" height="50" rx="5" fill="#E9E4F7" />
        <rect x="142" y="97" width="66" height="15" rx="2" fill="#FF3D9A" />
        <text x="175" y="108" fill="#1A0614" fontFamily="'Permanent Marker', cursive" fontSize="8" textAnchor="middle">
          MIXTAPE VOL. 1
        </text>
        <rect x="152" y="118" width="46" height="20" rx="9" fill="#1A1030" />
        <g className="reel">
          <circle cx="160" cy="128" r="7" fill="#0C0817" stroke="#CFC6E6" strokeWidth="1.5" />
          <path d="M160 122 v12 M154 128 h12" stroke="#CFC6E6" strokeWidth="1.5" />
        </g>
        <g className="reel">
          <circle cx="190" cy="128" r="7" fill="#0C0817" stroke="#CFC6E6" strokeWidth="1.5" />
          <path d="M190 122 v12 M184 128 h12" stroke="#CFC6E6" strokeWidth="1.5" />
        </g>
        <rect x="146" y="160" width="58" height="6" rx="3" fill="#2A2140" />
        <rect x="146" y="172" width="58" height="6" rx="3" fill="#2A2140" />
      </svg>

      <span className="sticker" style={{ left: '4.6%', top: '74.5%', width: '10.9%', background: '#FFC23D', borderRadius: '28%', transform: 'rotate(-12deg)' }}>
        <svg viewBox="0 0 24 24">
          <path d="M3 18h18l1-11-5.5 4.5L12 4l-4.5 7.5L2 7z" fill="#1A1200" />
        </svg>
      </span>
      <span
        className="sticker"
        style={{ right: '3.4%', top: '25.5%', width: '10.3%', background: '#1A0D10', border: '2px solid #E5243B', borderRadius: '25%', transform: 'rotate(10deg)' }}
      >
        <svg viewBox="0 0 24 24">
          <path d="M13.5 2L4 14h7l-1.5 8L19 10h-7z" fill="#FF5468" />
        </svg>
      </span>
      <span className="sticker" style={{ right: '8.6%', top: '77.4%', width: '10.3%', background: '#FF8AD8', borderRadius: '50%', transform: 'rotate(9deg)' }}>
        <svg viewBox="0 0 24 24">
          <path d="M12 21s-7.5-4.6-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2 4.4-9.5 9-9.5 9z" fill="#3A0A2A" />
        </svg>
      </span>
      <svg className="sticker-tag" viewBox="0 0 72 30" style={{ left: '39.7%', top: '84.9%', width: '20.6%', transform: 'rotate(-4deg)' }}>
        <path d="M4 12c8-10 12 6 20-2s10 6 18-1 10 5 16-1 8 2 10 0" fill="none" stroke="#3DE3FF" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M24 12v8M42 10v12M58 11v6" stroke="#3DE3FF" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="23" r="1.8" fill="#3DE3FF" />
        <circle cx="42" cy="25" r="1.8" fill="#3DE3FF" />
      </svg>
    </div>
  );
}
