import React from "react";
export function Input(props) {
  return <input {...props} className={"border rounded-lg px-3 py-2 w-full " + (props.className||"")} />;
}