import type { CSSProperties, ReactNode } from "react";

export function BrandLogo({
  src,
  className,
  style,
  children,
}: {
  src?: string | null;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={`relative block shrink-0 overflow-hidden ${className}`}
      style={style}
    >
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
      {src !== null && src !== undefined && src !== "" ? (
        <img
          alt=""
          className="absolute inset-0 size-full bg-container object-contain"
          key={src}
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
          src={src}
        />
      ) : null}
    </span>
  );
}
