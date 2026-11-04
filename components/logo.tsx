import { cn } from "@/lib/utils";

// nova.ai logomark — six rounded petals around an empty hub,
// recreated as vector art so it stays crisp in both themes.
function Petal({ angle, length }: { angle: number; length: number }) {
  return (
    <rect
      x={42}
      y={8}
      width={16}
      height={length}
      rx={8}
      transform={`rotate(${angle} 50 50)`}
    />
  );
}

export function NovaMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      fill="currentColor"
    >
      <Petal angle={-90} length={30} />
      <Petal angle={-30} length={20} />
      <Petal angle={30} length={30} />
      <Petal angle={90} length={20} />
      <Petal angle={150} length={30} />
      <Petal angle={210} length={20} />
    </svg>
  );
}

export function NovaLogo({
  markSize = 36,
  className,
  textClassName,
}: {
  markSize?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <NovaMark size={markSize} />
      <span
        className={cn("font-nova text-2xl font-semibold leading-none tracking-tight", textClassName)}
      >
        nova.ai
      </span>
    </span>
  );
}
