import { Logo } from "@/components/brand/logo";
import { LightField } from "@/components/signal/light-field";

/** Volet de marque des pages de connexion (grand écran) : le logo, une bande de mosaïque braise et la promesse du site. */
export function AuthPanel({ tagline }: { tagline: string }) {
  return (
    <div className="theme-dark wash-dark relative isolate flex min-h-[30rem] flex-col justify-between overflow-hidden rounded-md border border-line bg-bg p-8 text-fg">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-[28%] -z-10 h-[34%]"
      >
        <LightField animated={false} />
      </div>
      <Logo tone="dark" />
      <p className="max-w-xs font-display text-h3 text-fg">{tagline}</p>
    </div>
  );
}
