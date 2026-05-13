import { cn } from "@/lib/utils";

interface AppLogoProps {
  className?: string;
  imageClassName?: string;
  boxed?: boolean;
  subtitle?: string;
  subtitleClassName?: string;
  src?: string;
  alt?: string;
}

export function AppLogo({
  className,
  imageClassName,
  boxed = false,
  subtitle,
  subtitleClassName,
  src,
  alt = "Company logo",
}: AppLogoProps) {
  const assetBase =
    (window as Window & { MTLHR_PORTAL_ASSET_BASE?: string }).MTLHR_PORTAL_ASSET_BASE || "";
  const normalizedBase = assetBase.endsWith("/") ? assetBase.slice(0, -1) : assetBase;

  const image = (
    <img
      src={src || `${normalizedBase}/branding/microtech-logo.png`}
      alt={alt}
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
