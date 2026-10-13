/**
 * Static twilight sky for menus: midnight indigo into royal dusk and back to indigo behind
 * the actions. The mauve horizon and coral sunset are drawn behind the skyline itself (Lobby),
 * so they line up with the city on any screen height.
 */
export function Backdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        background: "linear-gradient(180deg, #10172f 0%, #1d2048 24%, #292c58 46%, #1d2048 70%, #10172f 100%)",
      }}
    />
  );
}
