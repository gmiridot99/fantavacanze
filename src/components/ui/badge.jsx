import React from "react";
export function Badge({ className = "", children }) {
  return <span className={"inline-flex items-center justify-center text-xs px-2 py-1 bg-black text-white " + className}>{children}</span>;
}