import React from "react";
export function Textarea(props) {
  return <textarea {...props} className={"border rounded-lg px-3 py-2 w-full min-h-[80px] " + (props.className||"")} />;
}