/** TODO(board agent): the full 40-tile square board from engine data. */
export function Board() {
  return (
    <mesh position={[0, 0.05, 0]}>
      <boxGeometry args={[11, 0.1, 11]} />
      <meshStandardMaterial color="#d8e8d0" />
    </mesh>
  );
}
