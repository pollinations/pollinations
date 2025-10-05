import * as React from "react"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = "", ...props }, ref) => (
    <div ref={ref} className={`rounded-xl border shadow ${className}`} {...props} />
  )
)
Card.displayName = "Card"

export { Card }
