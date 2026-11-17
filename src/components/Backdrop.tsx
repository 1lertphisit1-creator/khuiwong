export function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-amber/20 blur-3xl" />
      <div className="absolute top-1/3 -right-20 h-96 w-96 rounded-full bg-teal/15 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(246,241,231,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(246,241,231,0.045)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]" />
    </div>
  )
}
