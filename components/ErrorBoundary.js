"use client";
// Keeps one broken page from white-screening the whole app (the nav/top bar stays usable).
import { Component } from "react";
import { RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error("Page error:", err); } catch {} }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) {
      return (
        <div className="panel stack" style={{ margin: 16, alignItems: "flex-start" }}>
          <h2>Something on this page hiccuped</h2>
          <p className="muted small" style={{ margin: 0 }}>The rest of Modo is fine — the menu above still works. Try reloading this page.</p>
          <button onClick={() => { this.setState({ err: null }); location.reload(); }}><RefreshCw size={15} /> Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
