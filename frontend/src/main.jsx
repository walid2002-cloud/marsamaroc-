import React, { Component } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const msg =
        this.state.error?.message || String(this.state.error || "Erreur");
      return (
        <main
          style={{
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            maxWidth: 560,
            margin: "40px auto",
          }}
        >
          <h1 style={{ fontSize: "1.25rem" }}>L’application n’a pas pu s’afficher</h1>
          <p style={{ color: "#64748b", marginTop: 8 }}>
            Une erreur frontend est survenue. Rechargez la page et vérifiez la
            configuration de l’API backend. Détail technique :
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: "#f1f5f9",
              borderRadius: 8,
              overflow: "auto",
              fontSize: 13,
            }}
          >
            {msg}
          </pre>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
