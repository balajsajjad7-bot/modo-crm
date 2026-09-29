"use client";
// Live geofence view: who's inside the office right now, and today's leave/return log.
import { usePoll } from "./api";
import { MapPin, LogOut, LogIn, Clock } from "lucide-react";

const time = (d) => new Date(d).toLocaleTimeString("en-US", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit" });
const ago = (d) => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? "just now" : m < 60 ? m + "m ago" : Math.round(m / 60) + "h ago"; };

export default function Whereabouts() {
  const [{ data }] = usePoll("/api/geo", 20000);
  if (!data) return <p className="muted">Loading whereabouts…</p>;
  if (!data.officeSet) return <div className="panel"><h2><MapPin size={17} /> Whereabouts</h2><p className="muted">Set your office location first in <b>Setup → Settings → Office IP lock</b> (office latitude/longitude and radius). Then agents' leave/return is tracked here.</p></div>;
  const inside = data.agents.filter((a) => a.geoInside === true);
  const outside = data.agents.filter((a) => a.geoInside === false);
  const unknown = data.agents.filter((a) => a.geoInside == null);
  const Card = ({ a, state }) => (
    <div className="wa-agent">
      <span className={"wa-dot " + state} />
      <div style={{ flex: 1, minWidth: 0 }}><b>{a.name}</b><div className="muted small">{a.agentId}{a.geoAt ? ` · since ${time(a.geoAt)}` : ""}{!a.online ? " · offline" : ""}</div></div>
    </div>
  );
  return (
    <div className="stack">
      <section className="panel stack">
        <h2><MapPin size={17} /> Who's at the office (live · within {data.radius} m)</h2>
        <div className="wa-grid">
          <div><h3 className="wa-h in">Inside ({inside.length})</h3>{inside.length ? inside.map((a) => <Card key={a.id} a={a} state="in" />) : <p className="muted small">Nobody inside.</p>}</div>
          <div><h3 className="wa-h out">Away ({outside.length})</h3>{outside.length ? outside.map((a) => <Card key={a.id} a={a} state="out" />) : <p className="muted small">Nobody away.</p>}</div>
          {unknown.length > 0 && <div><h3 className="wa-h">No location yet ({unknown.length})</h3>{unknown.map((a) => <Card key={a.id} a={a} state="unk" />)}</div>}
        </div>
        <p className="muted small" style={{ margin: 0 }}>Location updates while an agent has Modo open. Agents must allow location once.</p>
      </section>
      <section className="panel stack">
        <h2><Clock size={17} /> Today's comings & goings</h2>
        {data.events.length === 0 ? <p className="muted">No leave/return events in the last 24 hours.</p> : (
          <div className="wa-log">{data.events.map((e) => (
            <div key={e.id} className="wa-row">
              {e.type === "left" ? <LogOut size={15} style={{ color: "#ff8a92" }} /> : <LogIn size={15} style={{ color: "#6ee7b7" }} />}
              <b>{e.name}</b><span className="muted">{e.type === "left" ? "left the office" : "came back"}{e.distance != null ? ` · ${e.distance > 2000 ? (e.distance / 1000).toFixed(1) + " km" : e.distance + " m"}` : ""}</span>
              <span className="muted small" style={{ marginLeft: "auto" }}>{time(e.at)} · {ago(e.at)}</span>
            </div>
          ))}</div>
        )}
      </section>
    </div>
  );
}
