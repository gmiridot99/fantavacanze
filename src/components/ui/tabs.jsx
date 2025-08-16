import React from "react";

export function Tabs({ value, onValueChange, children, className = "" }) {
  return (
    <div className={className}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, { current: value, onValueChange })
          : child
      )}
    </div>
  );
}

export function TabsList({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

export function TabsTrigger({ value, children, className = "", current, onValueChange }) {
  const active = current === value;
  return (
    <button
      className={`${className} px-3 py-2 rounded-xl border ${active ? "bg-black text-white" : "bg-white"}`}
      onClick={() => onValueChange && onValueChange(value)}
      type="button"
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, current }) {
  if (current !== value) return null;
  return <div>{children}</div>;
}
