import { cn } from "@/lib/utils";

interface AppLogoProps {
  className?: string;
  imageClassName?: string;
  boxed?: boolean;
  subtitle?: string;
  subtitleClassName?: string;
}

export function AppLogo({
  className,
  imageClassName,
  boxed = false,
  subtitle,
  subtitleClassName,
}: AppLogoProps) {
  const image = (
    <img
      src="/branding/microtech-logo.png"
      alt="Micro Tech London Ltd"
      className={cn("h-auto w-full object-contain", imageClassName)}
    />
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {boxed ? (
        <div className="rounded-lg bg-white px-2 py-1 shadow-sm">
          {image}
        </div>
      ) : (
        image
      )}
      {subtitle && (
        <p className={cn("text-xs text-muted-foreground", subtitleClassName)}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
