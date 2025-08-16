import React from "react";

function textFromNode(node) {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (React.isValidElement(node)) return textFromNode(node.props?.children);
  return "";
}

export function Select({ value, onValueChange, children, className = "" }) {
  const arr = React.Children.toArray(children);
  let placeholder = "Seleziona";
  const items = [];

  arr.forEach((ch) => {
    const t = ch?.type?.displayName || ch?.type?.name;
    if (t === "SelectTrigger") {
      React.Children.forEach(ch.props.children, (vn) => {
        const tn = vn?.type?.displayName || vn?.type?.name;
        if (tn === "SelectValue" && vn?.props?.placeholder) {
          placeholder = vn.props.placeholder;
        }
      });
    }
    if (t === "SelectContent") {
      React.Children.forEach(ch.props.children, (it) => {
        if (it?.props?.value !== undefined) {
          items.push({ value: it.props.value, label: textFromNode(it.props.children) });
        }
      });
    }
    if (t === "SelectItem") {
      items.push({ value: ch.props.value, label: textFromNode(ch.props.children) });
    }
  });

  const handleChange = (e) => onValueChange && onValueChange(e.target.value);

  return (
    <select
      className={"border rounded-lg px-3 py-2 w-full " + className}
      value={value ?? ""}
      onChange={handleChange}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {items.map((it) => (
        <option key={String(it.value)} value={it.value}>
          {it.label}
        </option>
      ))}
    </select>
  );
}

export function SelectTrigger() { return null; }
SelectTrigger.displayName = "SelectTrigger";

export function SelectValue() { return null; }
SelectValue.displayName = "SelectValue";

export function SelectContent() { return null; }
SelectContent.displayName = "SelectContent";

export function SelectItem() { return null; }
SelectItem.displayName = "SelectItem";
