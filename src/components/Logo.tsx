export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`logo logo-${size}`}>
      <span className="logo-eq" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="logo-text">
        MUSIC<span>GUESSER</span>
      </span>
    </span>
  );
}
