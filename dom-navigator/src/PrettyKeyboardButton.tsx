import type React from "react";

export function PrettyKeyboardButton({ children }: { children: React.ReactNode; }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 20,
        padding: "0 6px",
        height: 22,
        borderRadius: 6,
        border: "1px solid #d1d5db",
        background: "#fff",
        boxShadow: "inset 0 -1px 0 #e5e7eb",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      }}
    >
      {children}
    </span>
  );
}
