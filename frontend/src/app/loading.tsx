export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="min-h-screen bg-parchment flex items-center justify-center"
    >
      <span
        className="w-8 h-8 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin"
        aria-hidden="true"
      />
    </div>
  );
}
