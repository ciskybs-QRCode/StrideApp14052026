import { createContext, useContext } from "react";

export type Branding = {
  primary:   string;
  secondary: string;
  logo:      string | null;
  orgName:   string | null;
};

const defaultBranding: Branding = {
  primary:   "#1E3A8A",
  secondary: "#D4AF37",
  logo:      null,
  orgName:   null,
};

export const BrandingContext = createContext<Branding>(defaultBranding);

export function useBranding(): Branding {
  return useContext(BrandingContext);
}

type BrandingProviderProps = {
  branding?: Partial<Branding> | null;
  children:  React.ReactNode;
};

export function BrandingProvider({ branding, children }: BrandingProviderProps) {
  const value: Branding = {
    primary:   branding?.primary   ?? defaultBranding.primary,
    secondary: branding?.secondary ?? defaultBranding.secondary,
    logo:      branding?.logo      ?? defaultBranding.logo,
    orgName:   branding?.orgName   ?? defaultBranding.orgName,
  };

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}
