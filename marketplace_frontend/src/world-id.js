// Placeholder for World ID integration
// In a real implementation, you would use the World ID JS widget here
// and call the /api/world/verify endpoint on success.

export function WorldIDButton({ onVerify }) {
  return (
    <button onClick={() => {
      // Simulate World ID verification for demo
      fetch('/api/world/verify', { method: 'POST', credentials: 'include' })
        .then(res => res.json())
        .then(onVerify);
    }}>
      Verify with World ID
    </button>
  );
}
