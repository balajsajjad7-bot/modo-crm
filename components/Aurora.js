// Living warm aurora behind every page: drifting "light blades", film grain and a vignette. Pure CSS.
export default function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <div className="glow" />
      <div className="blade b1" /><div className="blade b2" /><div className="blade b3" /><div className="blade b4" /><div className="blade b5" />
      <div className="grain" />
      <div className="vignette" />
    </div>
  );
}
