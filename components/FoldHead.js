"use client";
// A section heading with a minimize button. Minimized sections show only their heading; the choice is
// remembered on this device. Usage: replace the section's <h2> with <FoldHead id="…" icon={…} title="…" />.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Minus } from "lucide-react";

export default function FoldHead({ id, icon, title, children }) {
  const ref = useRef(null); const [min, setMin] = useState(false);
  useEffect(() => { try { setMin(localStorage.getItem("modo-fold-" + id) === "1"); } catch {} }, [id]);
  useEffect(() => { const sec = ref.current?.parentElement; if (sec) sec.classList.toggle("folded", min); }, [min]);
  const flip = () => setMin((m) => { try { localStorage.setItem("modo-fold-" + id, m ? "0" : "1"); } catch {} return !m; });
  return (
    <div className="fold-h" ref={ref}>
      <h2>{icon}{title}</h2>
      {children}
      <button type="button" className="ghost sm fold-btn" onClick={flip} aria-expanded={!min} title={min ? "Show" : "Minimize"}>
        {min ? <><ChevronDown size={14} /> Show</> : <><Minus size={14} /> Minimize</>}
      </button>
    </div>
  );
}
