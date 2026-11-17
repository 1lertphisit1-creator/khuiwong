export function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -top-24 left-[12%] h-[28rem] w-[18rem] rounded-full bg-burgundy/50 blur-3xl" />
      <div className="absolute right-[-6rem] bottom-[-4rem] h-[24rem] w-[24rem] rounded-full bg-gold/10 blur-3xl" />
      <svg className="absolute -right-16 top-6 h-[34rem] w-[22rem] text-gold opacity-[0.09] sm:w-[34rem]" viewBox="0 0 200 324" fill="none">
        <path d="M200 324H76.4a123.6 123.6 0 0 1 0-247.2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M200 200.4h-76.4a76.4 76.4 0 1 1 76.4-76.4" stroke="currentColor" strokeWidth="1.2" />
        <path d="M200 124a47.2 47.2 0 1 1-47.2-47.2" stroke="currentColor" strokeWidth="1.1" />
        <path d="M200 76.8a29.2 29.2 0 1 1-29.2-29.2" stroke="currentColor" strokeWidth="1" />
        <path d="M200 47.6a18 18 0 1 1-18-18" stroke="currentColor" strokeWidth="0.9" />
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(212,179,106,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(212,179,106,0.045)_1px,transparent_1px)] bg-[size:84px_52px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
    </div>
  )
}
