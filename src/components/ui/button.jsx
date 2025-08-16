import React from "react";

const base = "inline-flex items-center justify-center rounded-xl px-3 py-2 border transition";
const styles = {
  default: "bg-black text-white border-black",
  outline: "bg-white text-black border",
  secondary: "bg-slate-100 text-slate-900 border-slate-200",
  destructive: "bg-red-600 text-white border-red-700 hover:bg-red-700",
};

export function Button({ className = "", variant = "default", size, children, ...props }) {
  const cls = `${base} ${styles[variant] || styles.default} ${className}`;
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}
