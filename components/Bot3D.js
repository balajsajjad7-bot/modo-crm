"use client";
// Modo's own 3D robot, drawn with CSS 3D (real cubes, no images): glowing visor, blinking eyes, antenna,
// power core and a holographic base. It sways by itself and turns toward the mouse (--mx / --my on a parent).
const Box = ({ cls, children }) => (
  <div className={"b3-box " + cls}>
    <i className="f fr">{children}</i><i className="f bk" /><i className="f lt" /><i className="f rt" /><i className="f tp" /><i className="f bt" />
  </div>
);

export default function Bot3D({ c1 = "#a78bfa", c2 = "#6366f1", eye = "#67e8f9", size = 1, delay = 0, label, className = "" }) {
  return (
    <div className={"b3 " + className} style={{ "--c1": c1, "--c2": c2, "--eye": eye, "--z": size, "--dl": delay + "s" }} aria-hidden={label ? undefined : "true"} role={label ? "img" : undefined} aria-label={label}>
      <div className="b3-float">
        <div className="b3-look">
          <div className="b3-turn">
            <div className="b3-ant"><span /><b /></div>
            <Box cls="b3-head">
              <span className="b3-visor"><em /><em /></span>
              <span className="b3-mouth" />
            </Box>
            <div className="b3-ear l" /><div className="b3-ear r" />
            <Box cls="b3-neck" />
            <Box cls="b3-body"><span className="b3-core" /><span className="b3-vent" /></Box>
            <div className="b3-arm l"><Box cls="b3-hand" /></div>
            <div className="b3-arm r"><Box cls="b3-hand" /></div>
          </div>
        </div>
      </div>
      <div className="b3-base"><span /><span /><span /></div>
    </div>
  );
}
