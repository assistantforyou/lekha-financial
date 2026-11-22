import React from "react"

export function ReleasePolicies() {
  const terms = import.meta.env.VITE_TERMS_URL, privacy = import.meta.env.VITE_PRIVACY_URL
  if (!terms && !privacy) return null
  return <p className="mt-3 flex gap-4 text-sm">
    {terms && <a className="underline" href={terms}>Subscription terms</a>}
    {privacy && <a className="underline" href={privacy}>Privacy notice</a>}
  </p>
}
