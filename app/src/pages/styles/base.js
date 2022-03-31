export function SmallContainer({ children }) {
  return (
    <div style={{
      minWidth: '20%', maxWidth: 600, margin: 'auto', marginBottom: '7em',
    }}
    >
      {children}
    </div>
  );
}
